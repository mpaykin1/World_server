'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');

test('reference sprite synthesizer is a real image-output lane',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','services','ai3d-worker','ai3d','plugins','reference_sprite.py'),'utf8');
  assert.match(source,/ReferenceSpriteSynthesizer/);assert.match(source,/reference-sprite-atlas\.png/);assert.match(source,/pixelExactCopy/);
});

test('reference sprite lane emits a four-frame PNG atlas when Python deps exist',()=>{
  const python=['python3','python'].find(bin=>cp.spawnSync(bin,['--version'],{encoding:'utf8'}).status===0);
  if(!python)return test.skip('python unavailable');
  const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ws-sprite-'));
  const code="import sys,json;sys.path.insert(0,'services/ai3d-worker');from ai3d.plugins.reference_sprite import ReferenceSpriteSynthesizer;from pathlib import Path;a,m=ReferenceSpriteSynthesizer().run(Path(sys.argv[1]),Path(sys.argv[2]),{});j=json.loads(m.read_text());print(json.dumps({'atlas':a.is_file(),'frames':j['frames'],'exact':j['pixelExactCopy'],'w':j['frameWidth'],'h':j['frameHeight']}))";
  const run=cp.spawnSync(python,['-c',code,'test/fixtures/voxel_building.png',dir],{cwd:root,encoding:'utf8'});
  if(run.status!==0&&/No module named/.test(run.stderr||''))return test.skip('python sprite deps unavailable');
  assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout.trim());
  assert.equal(out.atlas,true);assert.equal(out.frames,4);assert.equal(out.exact,false);assert.equal(out.w,32);assert.equal(out.h,48);
});
