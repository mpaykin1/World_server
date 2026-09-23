'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildEmergenceState } = require('../lib/world-emergence');
const voxel = require('../api/voxel')._private;

function adminWorld() {
  let world = {
    id: 'main', seed: 413,
    settings: { name: 'Shared world', worldDNA: { emergence: buildEmergenceState({seed:413,entities:[]}) } },
    updated_at: '2026-09-22T07:00:00.000Z'
  };
  const admin = {
    get world() { return JSON.parse(JSON.stringify(world)); },
    from(table) {
      assert.equal(table,'voxel_worlds');
      const filters={};
      let patch=null;
      return {
        select() { return this; },
        update(input) { patch=input; return this; },
        eq(field, val) { filters[field]=val; return this; },
        async single() {
          assert.equal(filters.id,world.id);
          return {data:JSON.parse(JSON.stringify(world)),error:null};
        },
        async maybeSingle() {
          assert.equal(filters.id,world.id);
          if(filters.updated_at!==world.updated_at)return {data:null,error:null};
          world={...world,...JSON.parse(JSON.stringify(patch))};
          return {data:JSON.parse(JSON.stringify(world)),error:null};
        }
      };
    }
  };
  return admin;
}
const identity={userId:null,guestId:'guest-A'};
test('two simultaneous macro placements preserve both changes',async()=>{
  const admin=adminWorld();
  const [city,forest]=await Promise.all([
    voxel.actionMacroPlace(admin,identity,{worldId:'main',type:'city',position:{x:0,y:42,z:0}}),
    voxel.actionMacroPlace(admin,{userId:null,guestId:'guest-B'},{worldId:'main',type:'forest',position:{x:45,y:42,z:0}})
  ]);
  assert.equal(city.placedType,'city');
  assert.equal(forest.placedType,'forest');
  const state=admin.world.settings.worldDNA.emergence;
  assert.equal(state.revision,3);
  assert.deepEqual(state.entities.map(e=>e.type).sort(),['city','forest']);
  assert.equal(state.relations[0].kind,'living_frontier');
});
test('concurrent growth advances at most once for one expected revision',async()=>{
  const admin=adminWorld();
  await voxel.actionMacroPlace(admin,identity,{worldId:'main',type:'city',position:{x:0,y:42,z:0}});
  await voxel.actionMacroPlace(admin,identity,{worldId:'main',type:'forest',position:{x:45,y:42,z:0}});
  const before=admin.world.settings.worldDNA.emergence;
  const results=await Promise.all([
    voxel.actionMacroTick(admin,{worldId:'main',expectedRevision:before.revision}),
    voxel.actionMacroTick(admin,{worldId:'main',expectedRevision:before.revision})
  ]);
  const after=admin.world.settings.worldDNA.emergence;
  assert.equal(after.growthStage,2);
  assert.equal(after.revision,before.revision+1);
  assert.equal(results.filter(x=>x.skipped).length,1);
});
test('dragging an existing macro moves it instead of duplicating',async()=>{
  const admin=adminWorld();
  const first=await voxel.actionMacroPlace(admin,identity,{worldId:'main',type:'city',position:{x:0,y:42,z:0}});
  const id=first.emergence.entities[0].id;
  const moved=await voxel.actionMacroPlace(admin,identity,{worldId:'main',type:'city',id,position:{x:20,y:42,z:17}});
  assert.equal(moved.emergence.entities.length,1);
  assert.equal(moved.emergence.entities[0].id,id);
  assert.equal(moved.emergence.entities[0].x,20);
  assert.equal(moved.emergence.entities[0].z,17);
});
test('macro ticks reject missing revision instead of racing older clients',async()=>{
  const admin=adminWorld();
  await assert.rejects(()=>voxel.actionMacroTick(admin,{worldId:'main'}),{status:400});
});
test('voxel client uses board, revision-gated ticks and chunk refresh without reloading',()=>{
  const root=path.resolve(__dirname,'..');
  const js=fs.readFileSync(path.join(root,'apps/voxel-world/client.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'apps/voxel-world/index.html'),'utf8');
  const board=fs.readFileSync(path.join(root,'shared/world-emergence-board.js'),'utf8');
  assert.match(js,/WorldEmergenceBoard\.mount/);
  assert.match(js,/refreshEmergenceChunks/);
  assert.match(js,/expectedRevision:emergenceState\.revision/);
  assert.doesNotMatch(js,/location\.reload\(\)/);
  assert.match(html,/world-emergence-board\.(?:js|css)/);
  assert.match(board,/pointercancel/);
});
