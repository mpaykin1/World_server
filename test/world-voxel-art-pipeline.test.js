'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const ROOT=path.join(__dirname,'..'),ART=path.join(ROOT,'apps/voxel-world/voxel-art'),OLD=path.join(ROOT,'apps/voxel-art-lab/old');
const EXPECTED=['barren','city','forest','volcano','energy','idea','river','villager'];
const MIN_FEATURES={barren:25,city:80,forest:45,volcano:40,energy:20,idea:20,river:20,villager:15};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function glbJson(file){
  const bytes=fs.readFileSync(file);assert.equal(bytes.toString('ascii',0,4),'glTF',file);
  assert.equal(bytes.readUInt32LE(4),2,file);assert.equal(bytes.readUInt32LE(8),bytes.length,file);
  assert.equal(bytes.readUInt32LE(16),0x4e4f534a,file);
  return{bytes,json:JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim())};
}
test('voxel art contract supports aliases, semantic manifests and deterministic LOD selection',async()=>{
  const {voxelType,planVoxelPlacements,validVoxelManifest,assetLod,lodForDistance}=await import('../shared/graphics/voxel-art-contract.mjs');
  assert.equal(voxelType('earth'),'barren');assert.equal(voxelType('resident'),'villager');assert.equal(voxelType('dragon'),null);
  const entities=[{id:'a',type:'city',x:5,z:12,radius:34},{id:'a',type:'city',x:6,z:12},{id:'b',type:'volcano',position:{x:-10,z:12}}];
  assert.deepEqual(planVoxelPlacements({entities},8).map(x=>x.id),['a','b']);
  const manifest=JSON.parse(fs.readFileSync(path.join(ART,'manifest.json'),'utf8'));
  assert.equal(validVoxelManifest(manifest),true);const city=manifest.entities.find(x=>x.id==='city');
  assert.equal(assetLod(city,2).file,'city.lod2.glb');assert.equal(lodForDistance(5),0);assert.equal(lodForDistance(60),1);assert.equal(lodForDistance(120),2);
});
test('all eight NEW models are parseable optimized GLBs with monotonic LODs and semantic sidecars',async()=>{
  const {validVoxelManifest}=await import('../shared/graphics/voxel-art-contract.mjs');
  const manifest=JSON.parse(fs.readFileSync(path.join(ART,'manifest.json'),'utf8'));assert.equal(validVoxelManifest(manifest),true);
  assert.deepEqual(manifest.entities.map(x=>x.id).sort(),[...EXPECTED].sort());assert.equal(manifest.schemaVersion,2);
  for(const asset of manifest.entities){
    assert.equal(asset.license,'PROJECT-ORIGINAL-NO-SEPARATE-LICENSE',asset.id+' rights marker');
    assert.ok(asset.semantic.featureCount>=MIN_FEATURES[asset.id],asset.id+' semantic detail floor');
    let previous=Infinity;
    for(const lod of asset.lods){
      const {bytes,json}=glbJson(path.join(ART,lod.file));
      assert.equal(hash(bytes),lod.sha256,asset.id+' LOD'+lod.lod);
      assert.equal(bytes.length,lod.bytes);assert.ok(lod.bytes<5_000_000);assert.ok(lod.triangles>0&&lod.triangles<25_000);
      assert.ok(lod.triangles<=previous,asset.id+' non-monotonic LOD');previous=lod.triangles;
      assert.ok(Array.isArray(json.meshes)&&json.meshes.length,asset.id);assert.ok(Array.isArray(json.scenes),asset.id);
      assert.equal(JSON.stringify(json).includes('NaN'),false);assert.equal(JSON.stringify(json).includes('Infinity'),false);
    }
    const semPath=path.join(ART,asset.semantic.file),semBytes=fs.readFileSync(semPath),graph=JSON.parse(semBytes);
    assert.equal(hash(semBytes),asset.semantic.sha256);assert.equal(graph.kind,asset.id);assert.equal(graph.seed,asset.seed);
    assert.equal(graph.features.length>=asset.semantic.featureCount,true);
    const ids=new Set();for(const feature of graph.features){
      assert.ok(!ids.has(feature.id),feature.id);ids.add(feature.id);assert.ok(feature.id.startsWith(asset.id+':'));
      if(feature.bounds)for(const side of feature.bounds)for(const value of side)assert.ok(Number.isFinite(value));
      assert.ok(Array.isArray(feature.lodPresence));
    }
    assert.equal(graph.watercolorCompatibility.showVoxelWireframe,false);
  }
});
test('volcano retains causal semantic features and villager exposes animation-ready body parts',()=>{
  const volcano=JSON.parse(fs.readFileSync(path.join(ART,'semantics/volcano.json'),'utf8'));
  const v=new Map(volcano.features.map(x=>[x.id,x]));
  for(const id of ['volcano:crater','volcano:lavaSource','volcano:lavaChannel:00','volcano:lavaCascade:00','volcano:ridge:00','volcano:cliff:00','volcano:ashZone','volcano:valley','volcano:rockField','volcano:safeTerrace:00','volcano:vegetationZone'])assert.ok(v.has(id),id);
  assert.equal(v.get('volcano:lavaSource').gameplay.activeLava,true);
  assert.equal(v.get('volcano:safeTerrace:00').gameplay.habitable,true);
  const human=JSON.parse(fs.readFileSync(path.join(ART,'semantics/villager.json'),'utf8')),h=new Set(human.features.map(x=>x.id));
  for(const id of ['villager:head','villager:face','villager:eye:00','villager:nose','villager:mouth','villager:leftArm','villager:rightArm','villager:leftLeg','villager:rightLeg','villager:belt','villager:pocket:00','villager:accessory'])assert.ok(h.has(id),id);
  assert.deepEqual(human.recipeMeta.preparedClips,['idle','walk','work','carry','sit']);
});
test('OLD 1x baseline stays immutable and every NEW LOD0 differs and adds detail',()=>{
  const old=JSON.parse(fs.readFileSync(path.join(OLD,'manifest.json'),'utf8'));
  const fresh=JSON.parse(fs.readFileSync(path.join(ART,'manifest.json'),'utf8'));
  assert.deepEqual(old.entities.map(x=>x.id).sort(),[...EXPECTED].sort());
  for(const before of old.entities){
    const after=fresh.entities.find(x=>x.id===before.id);assert.ok(after);
    assert.notEqual(after.sha256,before.sha256,before.id);assert.ok(after.triangles>before.triangles,before.id+' triangles did not increase');
    const oldBytes=fs.readFileSync(path.join(OLD,before.file));assert.equal(hash(oldBytes),before.sha256,before.id+' OLD hash drift');
  }
});
test('viewer is local-only and exposes all eight, OLD NEW, LOD, animation and semantic debug controls',()=>{
  const html=fs.readFileSync(path.join(ROOT,'apps/voxel-art-lab/index.html'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'apps/voxel-art-lab/preview.mjs'),'utf8');
  for(const kind of EXPECTED)assert.match(html,new RegExp('data-kind="'+kind+'"'));
  for(const token of ['data-version="old"','data-version="new"','data-lod="0"','data-lod="1"','data-lod="2"','id="animation"','id="semantic"'])assert.ok(html.includes(token),token);
  assert.match(html,/\.\/vendor\/three\.module\.js/);assert.match(js,/\.\/vendor\/GLTFLoader\.js/);
  assert.doesNotMatch(html+js,/unpkg\.com|jsdelivr|cdnjs|https:\/\//);
  const notice=fs.readFileSync(path.join(ROOT,'apps/voxel-art-lab/vendor/README.txt'),'utf8');
  const license=fs.readFileSync(path.join(ROOT,'apps/voxel-art-lab/vendor/THREE-LICENSE.txt'),'utf8');
  assert.match(notice,/Exact tag: r165/);assert.match(notice,/License: MIT/);assert.match(license,/The MIT License/);
});
test('generator uses original recipes, hidden-face merging and no network/downloader',()=>{
  const source=fs.readFileSync(path.join(ROOT,'tools/voxel-art/generate_blender.py'),'utf8');
  const core=fs.readFileSync(path.join(ROOT,'tools/voxel-art/recipe_core.py'),'utf8');
  assert.match(source,/coarsen_voxels/);assert.match(source,/export_scene\.gltf/);assert.match(source,/semantic_graph_json/);
  assert.match(core,/stable_hash/);assert.match(core,/LOD_MAX_DETAIL/);assert.doesNotMatch(source+core,/requests\.get|urllib|subprocess|download/);
});
