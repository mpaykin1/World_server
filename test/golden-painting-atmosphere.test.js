const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const atmosphere=require('../shared/golden-painting-atmosphere.js');

test('canonical cycle durations are exact',()=>{
  assert.deepEqual(atmosphere.STANDARD.cycle,{day:60,sunset:60,night:10,sunrise:60,total:190});
  assert.equal(atmosphere.phaseAt(0).phase,'day');
  assert.equal(atmosphere.phaseAt(59.999).phase,'day');
  assert.equal(atmosphere.phaseAt(60).phase,'sunset');
  assert.equal(atmosphere.phaseAt(120).phase,'night');
  assert.equal(atmosphere.phaseAt(130).phase,'sunrise');
  assert.equal(atmosphere.phaseAt(190).phase,'day');
});

test('golden painting runtime is loaded by every playable web world',()=>{
  const worlds=['ai3d-voxel-city','cinematic-encounter','dark-void-scene','survival','voxel-world','world-sharabass'];
  for(const world of worlds){
    const html=fs.readFileSync(path.join(__dirname,'..','apps',world,'index.html'),'utf8');
    assert.match(html,/\/shared\/golden-painting-atmosphere\.js/,world);
  }
});

test('Three.js worlds register real scene atmosphere',()=>{
  for(const world of ['ai3d-voxel-city','cinematic-encounter','dark-void-scene','survival','voxel-world']){
    const js=fs.readFileSync(path.join(__dirname,'..','apps',world,'client.js'),'utf8');
    assert.match(js,/GoldenPaintingAtmosphere\?\.registerThree/,world);
  }
});
test('Sharabass custom shader receives time state and aerial perspective',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','apps','world-sharabass','index.html'),'utf8');
  assert.match(html,/goldenAtmosphereState/);
  assert.match(html,/smoothstep\(MAX_DIST \* 0\.32, MAX_DIST \* 0\.78, t\)/);
  assert.match(html,/atmosphereCol/);
});

test('painting doctrine includes atmospheric exception',()=>{
  assert.match(atmosphere.STANDARD.painting.foreground,/warmer/);
  assert.match(atmosphere.STANDARD.painting.background,/cooler/);
  assert.match(atmosphere.STANDARD.painting.exception,/sunset/);
  assert.ok(atmosphere.STANDARD.nightEmitters.includes('aurora glow'));
});


test('natural cycle state never depends on an undefined timer',()=>{
  const s=atmosphere.currentState(1500);
  assert.ok(atmosphere.PHASE_ORDER.includes(s.phase));
  assert.equal(typeof s.elapsedInCycle,'number');
});

test('depth grading encodes the painting foreground/background rules',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','shared','golden-painting-atmosphere.js'),'utf8');
  assert.match(src,/goldenPaintingDepthV2/);
  assert.match(src,/gpNear/);
  assert.match(src,/gpFar/);
  assert.match(src,/1\.26,\.64,1\.18,\.70/);
  assert.match(src,/goldenFarTint/);
});

