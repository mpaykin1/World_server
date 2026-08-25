'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');

test('protected error automatically materializes deterministic regression test',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgen-'));
  fs.mkdirSync(path.join(root,'data'),{recursive:true});
  fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
  fs.copyFileSync(path.join(process.cwd(),'data/regression-test-templates.json'),path.join(root,'data/regression-test-templates.json'));
  fs.copyFileSync(path.join(process.cwd(),'scripts/generate-regression-tests.js'),path.join(root,'scripts/generate-regression-tests.js'));
  fs.writeFileSync(path.join(root,'data/error-prevention-registry.json'),JSON.stringify({
    knownErrors:[{id:'controls-inverted-camera-relative',status:'protected',severity:'release-blocker'}]
  }));
  const r=cp.spawnSync(process.execPath,[path.join(root,'scripts/generate-regression-tests.js')],{cwd:root,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(root,'REGRESSION_TEST_GENERATION_REPORT.json'),'utf8'));
  assert.equal(report.generated.length,1);
  assert.equal(report.generated[0].errorId,'controls-inverted-camera-relative');
  assert.equal(fs.existsSync(path.join(root,'test/generated/controls-inverted-camera-relative.test.js')),true);
  fs.rmSync(root,{recursive:true,force:true});
});
