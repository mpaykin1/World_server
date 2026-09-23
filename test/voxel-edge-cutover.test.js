'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),edgeDir=path.join(root,'supabase/functions/world-emergence');
const source=fs.readFileSync(path.join(edgeDir,'voxel-actions.ts'),'utf8');
const built=esbuild.transformSync(source,{loader:'ts',format:'cjs',target:'node20'});
const local={exports:{}};
new Function('module','exports',built.code)(local,local.exports);
const handle=local.exports.handleVoxelAction;
function fakeDatabase(){
  const tables={voxel_player_states:[],voxel_block_overrides:[]};
  return {tables,admin:{from(name){
    assert.ok(tables[name],'unexpected database table '+name);
    const filters=[],groups=[];let operation='read',payload=null;
    const q={
      select(){return this},eq(k,v){filters.push([k,v]);return this},
      in(k,values){groups.push([k,values]);return this},
      limit(){return this},
      insert(data){operation='insert';payload=data;return this},
      update(data){operation='update';payload=data;return this},
      upsert(data){operation='upsert';payload=data;return this},
      async single(){return perform(true)},async maybeSingle(){return perform(true)},
      then(resolve,reject){return Promise.resolve(perform(false)).then(resolve,reject)}
    };
    function perform(single){
      const rows=tables[name].filter(r=>filters.every(([k,v])=>r[k]===v)
        &&groups.every(([k,values])=>values.includes(r[k])));
      if(operation==='insert'){
        const row={id:'test-player-row',yaw:0,pitch:0,selected_block:1,inventory:{wood:32},
          last_block_at:null,...payload};
        tables[name].push(row);return{data:single?row:[row],error:null};
      }
      if(operation==='update'){
        rows.forEach(row=>Object.assign(row,payload));
        return{data:single?(rows[0]||null):rows,error:null};
      }
      if(operation==='upsert'){
        const key=['world_id','x','y','z'];
        const existing=tables[name].find(row=>key.every(k=>row[k]===payload[k]));
        if(existing)Object.assign(existing,payload);
        else tables[name].push({...payload});
        return{data:single?(existing||payload):[existing||payload],error:null};
      }
      return{data:single?(rows[0]||null):rows,error:null};
    }
    return q;
  }}};
}
const makeRuntime=()=>({
  async readWorld(_admin,id){
    if(id!=='qa-world')throw Object.assign(Error('World missing'),{status:404});
    return{id:'qa-world',seed:73194217,settings:{name:'QA Voxel World'}};
  },
  safeWorldId(id){if(id!=='qa-world')throw Error('not QA world');return id;},
  json(body,status=200){return new Response(JSON.stringify(body),{status,
    headers:{'content-type':'application/json'}});}
});
async function action(admin,who,kind,data={}){
  const res=await handle(admin,who,{action:kind,worldId:'qa-world',...data},makeRuntime());
  return await res.json();
}
test('dedicated Supabase voxel edge bundles its internal module without external runtime duplication',()=>{
  const bundled=esbuild.buildSync({entryPoints:[path.join(edgeDir,'index.ts')],bundle:true,
    platform:'neutral',format:'esm',external:['https://*'],write:false,logLevel:'silent'});
  assert.ok(bundled.outputFiles[0].text.includes('handleVoxelAction'));
  assert.match(fs.readFileSync(path.join(root,'cloudflare-worker.js'),'utf8'),
    /url.pathname === '\/api\/voxel'\) return proxyVoxel/);
});
test('edge init, reconnect, save, persistent blocks and rate limit use one authoritative database',async()=>{
  const {admin,tables}=fakeDatabase(),who={kind:'guest',id:'22222222-2222-4222-8222-222222222222'};
  const first=await action(admin,who,'init');
  assert.equal(first.world.seed,73194217);assert.equal(first.player.id,who.id);
  assert.equal(tables.voxel_player_states.length,1);
  assert.equal((await action(admin,who,'player_save',{
    position:{x:1.25,y:43,z:1.75},yaw:.2,pitch:.1,selectedBlock:5
  })).ok,true);
  const restored=await action(admin,who,'init');
  assert.deepEqual(restored.player.position,{x:1.25,y:43,z:1.75});
  const placed=await action(admin,who,'set_block',{
    x:1,y:43,z:1,blockType:5,playerPosition:restored.player.position
  });
  assert.equal(placed.block.block_type,5);assert.deepEqual(placed.scienceEvents,[]);
  const loaded=await action(admin,who,'chunks',{chunks:[{x:0,z:0}]});
  assert.equal(loaded.blocks.length,1);assert.equal(loaded.blocks[0].block_type,5);
  await assert.rejects(action(admin,who,'set_block',{
    x:1,y:43,z:1,blockType:0,playerPosition:restored.player.position
  }),e=>e.status===429);
  assert.equal(tables.voxel_block_overrides.length,1);
});
test('edge rejects invalid positions, block types and far block edits before changes',async()=>{
  const {admin,tables}=fakeDatabase(),who={kind:'guest',id:'22222222-2222-4222-8222-222222222222'};
  await assert.rejects(action(admin,who,'player_save',{
    position:{x:Infinity,y:43,z:1},yaw:0,pitch:0,selectedBlock:1
  }),e=>e.status===400);
  await assert.rejects(action(admin,who,'set_block',{
    x:1,y:43,z:1,blockType:99,playerPosition:{x:1,y:43,z:1}
  }),e=>e.status===400);
  await assert.rejects(action(admin,who,'set_block',{
    x:100,y:43,z:100,blockType:5,playerPosition:{x:1,y:43,z:1}
  }),e=>e.status===400);
  assert.equal(tables.voxel_block_overrides.length,0);
});

test('exact-head Cloudflare gate requires real world seed, durable reconnect and native chunk reads',()=>{
  const verifier=fs.readFileSync(path.join(root,'scripts/verify-cloudflare-stack.cjs'),'utf8');
  assert.match(verifier,/world\?\.id !== 'main'/);
  assert.match(verifier,/world\?\.seed/);
  assert.match(verifier,/x-world-server-voxel-runtime/);
  assert.match(verifier,/action:'player_save'/);
  assert.match(verifier,/player position was not durably restored/);
  assert.match(verifier,/authoritative chunk read failed/);
});
