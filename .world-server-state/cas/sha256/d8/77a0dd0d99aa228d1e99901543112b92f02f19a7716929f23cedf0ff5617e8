'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');

test('strict closure blocks a fixable failed report and passes when clean',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'closure-'));
  fs.mkdirSync(path.join(root,'data'),{recursive:true});fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
  fs.copyFileSync(path.join(process.cwd(),'data/desktop-ai-error-closure-policy.json'),path.join(root,'data/desktop-ai-error-closure-policy.json'));
  fs.copyFileSync(path.join(process.cwd(),'scripts/desktop-ai-error-closure.js'),path.join(root,'scripts/desktop-ai-error-closure.js'));
  fs.writeFileSync(path.join(root,'DESKTOP_AI_EXTERNAL_BLOCKERS.json'),JSON.stringify({blockers:[]}));
  fs.writeFileSync(path.join(root,'WORK_IN_PROGRESS.md'),'## Final evidence\nVerified PASS evidence.\n');
  fs.writeFileSync(path.join(root,'DESKTOP_AI_FIX_LOOP_REPORT.json'),JSON.stringify({pass:true}));
  fs.writeFileSync(path.join(root,'QUALITY_REGRESSION_REPORT.json'),JSON.stringify({pass:false,violations:[{severity:'release-blocker',message:'fix me'}]}));
  let r=cp.spawnSync(process.execPath,[path.join(root,'scripts/desktop-ai-error-closure.js')],{cwd:root,encoding:'utf8',env:{...process.env,DESKTOP_AI_REQUIRE_COMPLETE:'1'}});
  assert.notEqual(r.status,0);
  fs.writeFileSync(path.join(root,'QUALITY_REGRESSION_REPORT.json'),JSON.stringify({pass:true,violations:[]}));
  r=cp.spawnSync(process.execPath,[path.join(root,'scripts/desktop-ai-error-closure.js')],{cwd:root,encoding:'utf8',env:{...process.env,DESKTOP_AI_REQUIRE_COMPLETE:'1'}});
  assert.equal(r.status,0,r.stderr);
  fs.rmSync(root,{recursive:true,force:true});
});
