import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoxelModRegistry,VOXEL_MOD_API_VERSION} from '../shared/voxel-mod-registry.mjs';
import {createGothicCityMod,GOTHIC_CITY_MOD_ID} from '../shared/mods/gothic-city.mjs';

test('Gothic City registers through the versioned voxel Mod Blueprint API',()=>{
  const registry=createVoxelModRegistry();
  const manifest=registry.register(createGothicCityMod());
  assert.equal(manifest.id,GOTHIC_CITY_MOD_ID);
  assert.equal(manifest.apiVersion,VOXEL_MOD_API_VERSION);
  assert.equal(manifest.license,'project-original');
  assert.equal(registry.hasStructure('gothic-city:tower'),true);
  assert.equal(registry.hasStructure('gothic-city:viaduct'),true);
  assert.equal(registry.snapshot().structures.length,2);
});

test('blueprint compilation is deterministic and serializable',()=>{
  const registry=createVoxelModRegistry();registry.register(createGothicCityMod());
  const recipe={structureId:'gothic-city:tower',blueprintVersion:1,seed:777,params:{width:7,height:16,origin:{x:4,y:12,z:-8}}};
  const a=registry.compileBlueprint(recipe),b=registry.compileBlueprint(recipe);
  assert.deepEqual(a,b);
  assert.equal(a.modId,'gothic-city');
  assert.equal(a.structure.kind,'gothic-tower');
  assert.ok(a.structure.voxels.length>100);
  assert.doesNotThrow(()=>JSON.stringify(a));
});

test('viaduct blueprints expose deterministic support locations',()=>{
  const registry=createVoxelModRegistry();registry.register(createGothicCityMod());
  const result=registry.compileBlueprint({
    structureId:'gothic-city:viaduct',blueprintVersion:1,seed:9,
    params:{spanCount:5,pierSpacing:8,deckY:10},
  });
  assert.equal(result.structure.kind,'gothic-viaduct');
  assert.equal(result.structure.pierXs.length,6);
  assert.equal(new Set(result.structure.pierXs).size,6);
});

test('registry fails closed on duplicate mods unknown structures and incompatible blueprint versions',()=>{
  const registry=createVoxelModRegistry(),mod=createGothicCityMod();
  registry.register(mod);
  assert.throws(()=>registry.register(mod),/already registered/);
  assert.throws(()=>registry.compileBlueprint({structureId:'gothic-city:cathedral',blueprintVersion:1}),/Unknown voxel structure/);
  assert.throws(()=>registry.compileBlueprint({structureId:'gothic-city:tower',blueprintVersion:2}),/Unsupported blueprint version/);
  assert.equal(registry.unregister('gothic-city'),true);
  assert.equal(registry.hasStructure('gothic-city:tower'),false);
});

test('mod registration rejects namespaces that can hijack another mod',()=>{
  const registry=createVoxelModRegistry();
  assert.throws(()=>registry.register({
    id:'evil-mod',version:'1.0.0',apiVersion:1,
    structures:{'gothic-city:tower':{blueprintVersion:1,generate(){return{voxels:[]};}}},
  }),/Invalid structure id/);
});
