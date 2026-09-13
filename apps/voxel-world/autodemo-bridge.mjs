import {createWorldStackAutodemo,AUTODEMO_VERSION} from '/shared/world-stack-autodemo.mjs';

export function installVoxelAutodemo(ctx){
  if(new URLSearchParams(location.search).get('autodemo')==='0') return null;
  const {THREE,scene,sun,hemi,player,heightAt,setBlockLocal,api,canonApi,worldId,token,uuid,BLOCK}=ctx;
  const persistent=new THREE.Group(); persistent.name='AutodemoPersistentWorldChanges'; scene.add(persistent);
  const env={mode:'normal',createdWorldUrl:null};
  const normal={sky:scene.background?.clone?.()||new THREE.Color(0x7fbced),fog:scene.fog?.color?.clone?.()||new THREE.Color(0x7fbced),sunColor:sun.color.clone(),sunIntensity:sun.intensity,hemiIntensity:hemi.intensity};
  const getPlayer=()=>({x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw});
  const groundY=(x,z)=>heightAt(Math.floor(x),Math.floor(z))+1;
  const toast=message=>window.AppCore?.toast?.(message);

  function applyEnvironment(now=performance.now()){
    const mode=env.mode;
    if(mode==='normal'||mode==='wind') return;
    if(mode==='sunset'){
      scene.background?.set?.(0xf08a62); scene.fog?.color?.set?.(0xd88979); sun.color.setHex(0xffb05d); sun.intensity=3.0; hemi.intensity=.72; sun.position.set(-70,18,-45);
    }else if(mode==='night'){
      scene.background?.set?.(0x071225); scene.fog?.color?.set?.(0x0b1630); sun.color.setHex(0x8ea8ff); sun.intensity=.22; hemi.intensity=.34; sun.position.set(-20,8,35);
    }else if(mode==='storm'){
      const flash=Math.max(0,Math.sin(now*.007)-.992)*90;
      scene.background?.set?.(flash>0?0xbfd5ec:0x26313d); scene.fog?.color?.set?.(0x364553); sun.color.setHex(0xcad9ff); sun.intensity=.32+flash; hemi.intensity=.42+flash*.2; sun.position.set(-25,28,20);
    }
  }
  function resetEnvironment(){env.mode='normal';scene.background?.copy?.(normal.sky);scene.fog?.color?.copy?.(normal.fog);sun.color.copy(normal.sunColor);sun.intensity=normal.sunIntensity;hemi.intensity=normal.hemiIntensity;}
  function setEnvironment({mode}){env.mode=mode||'normal';if(env.mode==='normal')resetEnvironment();else applyEnvironment();}

  async function commitBlocks(edits){
    const unique=new Map();
    for(const e of edits){if(!Number.isInteger(e.x)||!Number.isInteger(e.y)||!Number.isInteger(e.z)||e.y<1||e.y>=94)continue;unique.set(`${e.x},${e.y},${e.z}`,e)}
    const list=[...unique.values()].slice(0,180);
    for(const e of list)setBlockLocal(e.x,e.y,e.z,e.block);
    const batches=[];for(let i=0;i<list.length;i+=18)batches.push(list.slice(i,i+18));
    for(const batch of batches){await Promise.allSettled(batch.map(e=>api('set_block',{worldId,x:e.x,y:e.y,z:e.z,blockType:e.block,playerPosition:{x:player.pos.x,y:player.pos.y,z:player.pos.z}})));}
    return list.length;
  }
  function originAhead(distance=7){const x=Math.round(player.pos.x-Math.sin(player.yaw)*distance),z=Math.round(player.pos.z-Math.cos(player.yaw)*distance);return{x,z,y:groundY(x,z)};}
  function boxFill(out,x0,x1,y0,y1,z0,z1,block){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)out.push({x,y,z,block});}
  function shell(out,c,w,d,h,block){for(let y=0;y<h;y++)for(let x=-w;x<=w;x++)for(let z=-d;z<=d;z++){if(y===0||y===h-1||Math.abs(x)===w||Math.abs(z)===d)out.push({x:c.x+x,y:c.y+y,z:c.z+z,block})}}
  async function buildStructure(kind){
    const c=originAhead(8),e=[];
    if(kind==='house'){shell(e,c,2,2,4,BLOCK.PLANK);e.push({x:c.x,y:c.y+1,z:c.z-2,block:BLOCK.AIR},{x:c.x,y:c.y+2,z:c.z-2,block:BLOCK.AIR});}
    else if(kind==='tower'){shell(e,c,2,2,8,BLOCK.STONE);}
    else if(kind==='bridge'){for(let z=-7;z<=7;z++)for(let x=-1;x<=1;x++)e.push({x:c.x+x,y:c.y+2,z:c.z+z,block:BLOCK.PLANK});}
    else if(kind==='fortress'){for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)if(Math.abs(x)===5||Math.abs(z)===5)for(let y=0;y<4;y++)e.push({x:c.x+x,y:c.y+y,z:c.z+z,block:BLOCK.STONE});}
    else if(kind==='road'){for(let z=-10;z<=10;z++)for(let x=-1;x<=1;x++)e.push({x:c.x+x,y:c.y,z:c.z+z,block:BLOCK.STONE});}
    else if(kind==='mine'||kind==='exploreMine'||kind==='findCave'){for(let y=0;y<8;y++)for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)e.push({x:c.x+x,y:Math.max(2,c.y-y),z:c.z+z,block:BLOCK.AIR});}
    else if(kind==='lake'||kind==='bigLake'){const r=kind==='bigLake'?5:3;for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)if(x*x+z*z<=r*r)e.push({x:c.x+x,y:c.y,z:c.z+z,block:BLOCK.WATER});}
    else if(kind==='garden'||kind==='magicForest'){const r=kind==='magicForest'?5:3;for(let x=-r;x<=r;x+=2)for(let z=-r;z<=r;z+=2){e.push({x:c.x+x,y:c.y,z:c.z+z,block:BLOCK.WOOD});for(let y=1;y<=3;y++)e.push({x:c.x+x,y:c.y+y,z:c.z+z,block:BLOCK.WOOD});e.push({x:c.x+x,y:c.y+4,z:c.z+z,block:BLOCK.LEAVES});}}
    else if(kind==='settlement'||kind==='ancientCity'){for(const off of [[-5,0],[5,0],[0,-5],[0,5]]){const cc={x:c.x+off[0],z:c.z+off[1],y:c.y};shell(e,cc,2,2,3,kind==='ancientCity'?BLOCK.STONE:BLOCK.PLANK);}}
    else if(kind==='mountain'){for(let y=0;y<7;y++){const r=Math.max(1,5-y);for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)if(x*x+z*z<=r*r)e.push({x:c.x+x,y:c.y+y,z:c.z+z,block:BLOCK.STONE});}}
    const count=await commitBlocks(e);toast(`World change saved: ${count} blocks`);return count;
  }

  function material(color,emissive=0){return new THREE.MeshStandardMaterial({color,emissive,emissiveIntensity:emissive?1.4:0,roughness:.65});}
  function spawnStoryObject(kind,pos){
    const g=new THREE.Group();g.position.copy(pos);g.position.y=groundY(pos.x,pos.z);
    if(kind==='ancient'){for(const x of[-2,2]){const p=new THREE.Mesh(new THREE.BoxGeometry(1,5,1),material(0x777066));p.position.set(x,2.5,0);g.add(p)}const top=new THREE.Mesh(new THREE.BoxGeometry(5,1,1),material(0x777066));top.position.y=5;g.add(top);}
    else if(kind==='artifact'){const a=new THREE.Mesh(new THREE.OctahedronGeometry(.9),material(0x8fefff,0x2aaaff));a.position.y=1.4;g.add(a);}
    else if(kind==='tracks'){for(let i=0;i<5;i++){const t=new THREE.Mesh(new THREE.CircleGeometry(1.1,18),new THREE.MeshBasicMaterial({color:0x44352a,side:THREE.DoubleSide}));t.rotation.x=-Math.PI/2;t.position.set((i%2)*2.3,0.05,-i*3);g.add(t)}}
    else{const p=new THREE.Mesh(new THREE.CylinderGeometry(.55,.9,6,8),material(0x6b4ea8,0x271650));p.position.y=3;g.add(p)}persistent.add(g);return g;
  }
  function spawnPortal(kind,pos){const g=new THREE.Group();g.position.copy(pos);g.position.y=groundY(pos.x,pos.z)+2.8;const ring=new THREE.Mesh(new THREE.TorusGeometry(2.2,.22,12,48),material(0x54d7ff,0x1988ff));g.add(ring);const core=new THREE.Mesh(new THREE.CircleGeometry(1.95,36),new THREE.MeshBasicMaterial({color:0x5c46ff,transparent:true,opacity:.34,side:THREE.DoubleSide}));core.position.z=.05;g.add(core);g.userData.kind=kind;persistent.add(g);return g;}

  async function neighborUrl(){
    if(env.createdWorldUrl)return env.createdWorldUrl;
    try{const r=await fetch('/api/world-factory?limit=24',{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)return null;const j=await r.json();const w=(j.worlds||[]).find(x=>x.id!==worldId&&x.playUrl);return w?.playUrl||null}catch{return null}
  }
  async function createWorldPreview(spec){
    const p=originAhead(11),g=new THREE.Group();g.position.set(p.x,p.y+4,p.z);const colors={ice:0xbfeaff,green:0x5fbf68,volcanic:0xff5b32,sky:0x8fc9ff};const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(2.2,2),material(colors[spec.theme]||0x7bcf88));g.add(orb);persistent.add(g);
    const auth=token();if(!auth)return g;
    try{const headers={'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${auth}`};const requestId=uuid();const idea=`${spec.theme||'green'} world inhabited by ${spec.inhabitants||'creatures'}; generated from the interactive stack demo`;const r=await fetch('/api/world-factory',{method:'POST',headers,body:JSON.stringify({idea,title:`Demo ${spec.theme||'world'}`,requestId})});const j=await r.json().catch(()=>({}));if(r.ok&&j.world?.playUrl){env.createdWorldUrl=j.world.playUrl;spawnPortal('created-world',new THREE.Vector3(p.x+4,p.y,p.z));toast('New world created and linked.')}}catch(e){console.warn('[AUTODEMO WORLD]',e)}return g;
  }
  function recordCanon(eventType,summary,payload){return canonApi(eventType,summary,payload,uuid()).catch(e=>console.warn('[AUTODEMO CANON]',e));}

  const director=createWorldStackAutodemo({THREE,scene,getPlayer,groundY,setEnvironment,buildStructure,spawnStoryObject,spawnPortal,neighborUrl,createWorldPreview,recordCanon,toast});
  const apiObject={
    version:AUTODEMO_VERSION,
    update(now,dt){applyEnvironment(now);director.update(now,dt);},
    stats(){return{...director.stats(),environment:env.mode,createdWorldUrl:env.createdWorldUrl};},
    show:i=>director.show(i),choose:key=>director.choose(key),advance:()=>director.advance(),stop(){director.stop();resetEnvironment();}
  };
  window.WorldStackAutodemo=apiObject;
  return apiObject;
}
