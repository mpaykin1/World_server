'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');

const plugin=fs.readFileSync(path.join(__dirname,'..','services','ai3d-worker','ai3d','plugins','reference_media.py'),'utf8');
test('raw reference analyzer supports images and videos without paid AI',()=>{
  assert.match(plugin,/class ReferenceMediaAnalyzer/);
  assert.match(plugin,/ffmpeg/);
  assert.match(plugin,/pixelArtConfidence/);
  assert.match(plugin,/normalizedReference/);assert.match(plugin,/semanticClass/);
});
test('reference analyzer can inspect the existing PNG fixture when Python deps exist',()=>{
  const python=['python3','python'].find(bin=>cp.spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
  if(!python)return test.skip('python unavailable');
  const code="import sys,json,tempfile;sys.path.insert(0,'services/ai3d-worker');from ai3d.plugins.reference_media import ReferenceMediaAnalyzer;from pathlib import Path;p=Path(tempfile.gettempdir())/'ws-reference-analysis.json';ReferenceMediaAnalyzer().run(Path(sys.argv[1]),p,{'maxFrames':2});j=json.loads(p.read_text());print(json.dumps({'frames':j['sampledFrames'],'normalized':bool(j['normalizedReference']),'edge':j['frames'][0]['metrics']['edgeDensity'],'kind':j['frames'][0]['metrics']['semanticClass']}))";
  const run=cp.spawnSync(python,['-c',code,'test/fixtures/voxel_building.png'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  if(run.status!==0 && /No module named/.test(run.stderr||''))return test.skip('python media deps unavailable');
  assert.equal(run.status,0,run.stderr);
  const out=JSON.parse(run.stdout.trim());
  assert.equal(out.frames,1);assert.equal(out.normalized,true);assert.equal(typeof out.edge,'number');assert.equal(typeof out.kind,'string');
});
