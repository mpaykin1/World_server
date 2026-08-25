'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd();

function setup(allPass=true){
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fixloop-'));fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});fs.mkdirSync(path.join(tmp,'data'),{recursive:true});
 fs.copyFileSync(path.join(ROOT,'scripts/desktop-ai-fix-loop.js'),path.join(tmp,'scripts/desktop-ai-fix-loop.js'));
 fs.writeFileSync(path.join(tmp,'data/desktop-ai-fix-loop-policy.json'),JSON.stringify({maxAutomaticIterations:2}));
 for(const name of ['quality-regression-gate.js','project-quality-reviewer.js','duplicate-system-review.js','system-contract-review.js','check-cpu-only-autopilot.js','desktop-ai-error-closure.js']){
   fs.writeFileSync(path.join(tmp,'scripts',name),allPass?'process.exit(0)\n':'process.exit(1)\n');
 }
 fs.writeFileSync(path.join(tmp,'scripts/quality-autofix.js'),'process.exit(0)\n');
 cp.spawnSync('git',['init'],{cwd:tmp,encoding:'utf8'});cp.spawnSync('git',['config','user.email','a@b.c'],{cwd:tmp});cp.spawnSync('git',['config','user.name','t'],{cwd:tmp});fs.writeFileSync(path.join(tmp,'seed.txt'),'x');cp.spawnSync('git',['add','.'],{cwd:tmp});cp.spawnSync('git',['commit','-m','seed'],{cwd:tmp,encoding:'utf8'});
 return tmp;
}
test('fix loop emits clean PASS only when diagnostics/closure are clean',()=>{const tmp=setup(true);const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/desktop-ai-fix-loop.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const j=JSON.parse(fs.readFileSync(path.join(tmp,'DESKTOP_AI_FIX_LOOP_REPORT.json'),'utf8'));assert.equal(j.pass,true);fs.rmSync(tmp,{recursive:true,force:true})});
test('fix loop refuses to declare completion when unresolved errors remain',()=>{const tmp=setup(false);const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/desktop-ai-fix-loop.js')],{cwd:tmp,encoding:'utf8'});assert.notEqual(r.status,0);const j=JSON.parse(fs.readFileSync(path.join(tmp,'DESKTOP_AI_FIX_LOOP_REPORT.json'),'utf8'));assert.equal(j.pass,false);assert.match(j.nextAction,/must inspect|Continue manual/i);fs.rmSync(tmp,{recursive:true,force:true})});
