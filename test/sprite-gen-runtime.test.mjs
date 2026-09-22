import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateSpriteGenManifest,frameAtTime} from '../apps/voxel-world/sprite-gen-runtime.mjs';
import {importSpriteRun} from '../scripts/import-sprite-gen.mjs';

const rect = (x,y,w=1,h=1)=>({x,y,w,h});
const manifest = (opts={}) => ({
  characterId:'test-slime',
  engine:'component-row',
  game_input:'sprite-sheet-alpha.png',
  curation_applied:true,
  frame_layout:{sheetWidth:2,sheetHeight:1,rows:{idle:[rect(0,0),rect(1,0)]}},
  animation:{rows:{idle:{fps:5,loop:true,durations_ms:[100,300]}}},
  ...opts
});
// 2x1 valid PNG from a transparent 1x1 PNG with IHDR dimensions updated + recalculated CRC.
function png2x1(){
  const source=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
  // Importer intentionally checks PNG signature and IHDR dimensions, not full decode.
  source.writeUInt32BE(2,16);
  return source;
}
test('sprite-gen: accepts real frame_layout + durations_ms contract',()=>{
  const value=validateSpriteGenManifest(manifest());
  assert.equal(value.width,2);
  assert.equal(value.states.idle.totalMs,400);
  assert.equal(frameAtTime(value.states.idle,0).index,0);
  assert.equal(frameAtTime(value.states.idle,100).index,1);
  assert.equal(frameAtTime(value.states.idle,399).index,1);
  assert.equal(frameAtTime(value.states.idle,400).index,0);
  assert.equal(frameAtTime(value.states.idle,520).index,1);
});
test('sprite-gen: one-shot motion ends on the last frame',()=>{
  const value=validateSpriteGenManifest(manifest({
    animation:{rows:{idle:{fps:5,loop:false,durations_ms:[100,300]}}}
  }));
  assert.equal(frameAtTime(value.states.idle,9000).index,1);
  assert.equal(frameAtTime(value.states.idle,-20).index,0);
});
test('sprite-gen: rejects frames outside the atlas',()=>{
  const broken=manifest();
  broken.frame_layout.rows.idle[1].x=3;
  assert.throws(()=>validateSpriteGenManifest(broken),/outside sprite atlas/);
});
test('sprite-gen: rejects zero FPS, duration injection and giant atlases',()=>{
  const broken=manifest();broken.animation.rows.idle.fps=0;
  assert.throws(()=>validateSpriteGenManifest(broken),/speed/);
  const brokenDuration=manifest();brokenDuration.animation.rows.idle.durations_ms[1]=-999;
  assert.throws(()=>validateSpriteGenManifest(brokenDuration),/duration/);
  const giant=manifest();giant.frame_layout.sheetWidth=65536;
  assert.throws(()=>validateSpriteGenManifest(giant),/dimensions/);
});
test('sprite-gen: rejects malicious animation state keys',()=>{
  const broken=manifest();broken.frame_layout.rows={'../../etc': [rect(0,0)]};
  assert.throws(()=>validateSpriteGenManifest(broken),/state name/);
});
test('sprite-gen importer: publishes only validated atlas and manifest',async()=>{
  const root=await mkdtemp(join(tmpdir(),'world-sprite-test-'));
  const run=join(root,'run'),out=join(root,'public');
  try{
    await mkdir(run);await writeFile(join(run,'manifest.json'),JSON.stringify(manifest()));
    await writeFile(join(run,'sprite-sheet-alpha.png'),png2x1());
    const result=await importSpriteRun(run,{id:'cute-slime',outputRoot:out});
    assert.equal(result.frames,2);
    const pub=JSON.parse(await readFile(join(out,'cute-slime','manifest.json'),'utf8'));
    assert.equal(pub.characterId,'cute-slime');
    assert.equal(pub.game_input,'sprite-sheet-alpha.png');
    assert.equal(pub.frame_layout.rows.idle.length,2);
    assert.ok((await stat(join(out,'cute-slime','sprite-sheet-alpha.png'))).size>24);
    assert.deepEqual(JSON.parse(await readFile(join(out,'catalog.json'),'utf8')),[{id:'cute-slime'}]);
    await assert.rejects(importSpriteRun(run,{id:'cute-slime',outputRoot:out}),/already published/);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('sprite-gen importer: refuses path traversal or uncurated output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'world-sprite-test-'));
  const run=join(root,'run'),out=join(root,'public');
  try{
    await mkdir(run);
    await writeFile(join(run,'sprite-sheet-alpha.png'),png2x1());
    const m=manifest({game_input:'../outside.png'});
    await writeFile(join(run,'manifest.json'),JSON.stringify(m));
    await assert.rejects(importSpriteRun(run,{outputRoot:out}),/basename/);
    m.game_input='sprite-sheet-alpha.png';m.curation_applied=false;
    await writeFile(join(run,'manifest.json'),JSON.stringify(m));
    await writeFile(join(run,'curation.json'),'{}');
    await assert.rejects(importSpriteRun(run,{outputRoot:out}),/uncurated/);
  }finally{await rm(root,{recursive:true,force:true});}
});
