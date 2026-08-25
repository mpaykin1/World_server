'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
function run(cmd, args, cwd) { return cp.execFileSync(cmd, args, { cwd, encoding: 'utf8' }); }
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-risk-'));
  for (const d of ['apps','shared','scripts','test','e2e','data','api']) fs.mkdirSync(path.join(dir,d), { recursive:true });
  fs.copyFileSync(path.join(ROOT,'scripts/self-improvement-risk.js'), path.join(dir,'scripts/self-improvement-risk.js'));
  fs.copyFileSync(path.join(ROOT,'data/self-improvement-risk-policy.json'), path.join(dir,'data/self-improvement-risk-policy.json'));
  run('git',['init','-q'],dir); run('git',['config','user.email','test@example.com'],dir); run('git',['config','user.name','test'],dir);
  fs.writeFileSync(path.join(dir,'apps/a.js'),'const a=1;\n');
  run('git',['add','.'],dir); run('git',['commit','-qm','base'],dir);
  return dir;
}

test('tracked low-risk app change is eligible for auto merge', () => {
  const dir=fixture();
  fs.writeFileSync(path.join(dir,'apps/a.js'),'const a=2;\n');
  run(process.execPath,['scripts/self-improvement-risk.js'],dir);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'SELF_IMPROVEMENT_RISK.json'),'utf8'));
  assert.equal(report.risk,'low');
  assert.equal(report.autoMergeEligible,true);
});

test('untracked API file is never treated as low risk', () => {
  const dir=fixture();
  fs.writeFileSync(path.join(dir,'api/new.js'),'module.exports={};\n');
  run(process.execPath,['scripts/self-improvement-risk.js'],dir);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'SELF_IMPROVEMENT_RISK.json'),'utf8'));
  assert.notEqual(report.risk,'low');
  assert.equal(report.autoMergeEligible,false);
});

test('generated root reports are ignored because autonomous commit does not include them', () => {
  const dir=fixture();
  fs.writeFileSync(path.join(dir,'QUALITY_GROWTH_BACKLOG.json'),'{}\n');
  fs.writeFileSync(path.join(dir,'apps/a.js'),'const a=3;\n');
  run(process.execPath,['scripts/self-improvement-risk.js'],dir);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'SELF_IMPROVEMENT_RISK.json'),'utf8'));
  assert.equal(report.risk,'low');
  assert.equal(report.files.length,1);
});
