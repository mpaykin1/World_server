'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/sentry-production-verify.yml'),'utf8');
function stepBlocks(source){
  return source.match(/^      - [^\r\n]+(?:\r?\n(?= {8})[^\r\n]+)*/gm)||[];
}
function assertBudgets(source){
  const job=source.match(/^    timeout-minutes: ([0-9]+)\r?$/m);
  assert.ok(job,'Sentry job must have an explicit time budget');
  assert.ok(Number(job[1])>0&&Number(job[1])<=60,'Job budget must be at most 60 minutes');
  const install=stepBlocks(source).find(block=>block.includes('run: npx playwright install --with-deps chromium'));
  assert.ok(install,'Chromium installation must remain present');
  const step=install.match(/^        timeout-minutes: ([0-9]+)\r?$/m);
  assert.ok(step,'Chromium installation must have an explicit time budget');
  assert.ok(Number(step[1])>0&&Number(step[1])<=30,'Chromium budget must be at most 30 minutes');
  assert.ok(Number(step[1])<Number(job[1]),'Reserve job time for runtime checks');
  assert.doesNotMatch(source,/continue-on-error:\s*true|install --with-deps chromium[^\r\n]*\|\|\s*true/);
}
test('Sentry job and Chromium installation have bounded failure budgets',()=>assertBudgets(workflow));
test('budget guard rejects missing, excessive and invalid time limits',()=>{
  const fixture='jobs:\n  verify:\n    timeout-minutes: 60\n    steps:\n      - name: Install Chromium\n        timeout-minutes: 30\n        run: npx playwright install --with-deps chromium\n';
  assert.doesNotThrow(()=>assertBudgets(fixture));
  for(const invalid of [
    fixture.replace('    timeout-minutes: 60\n',''),
    fixture.replace('timeout-minutes: 60','timeout-minutes: 360'),
    fixture.replace('timeout-minutes: 60','timeout-minutes: 0'),
    fixture.replace('        timeout-minutes: 30\n',''),
    fixture.replace('timeout-minutes: 30','timeout-minutes: 31'),
    fixture.replace('timeout-minutes: 30','timeout-minutes: 0'),
    fixture.replace('timeout-minutes: 30','timeout-minutes: 0.5'),
    fixture.replace('        run:','        continue-on-error: true\n        run:'),
    fixture.replace('--with-deps chromium','--with-deps chromium || true')
  ])assert.throws(()=>assertBudgets(invalid));
});
test('Sentry runtime and production smoke remain mandatory after Chromium',()=>{
  const steps=stepBlocks(workflow);
  const installation=steps.findIndex(block=>block.includes('run: npx playwright install --with-deps chromium'));
  const runtime=steps.findIndex(block=>block.includes('run: node scripts/verify-sentry-production.js'));
  const smoke=steps.findIndex(block=>block.includes('run: node scripts/post-deploy-smoke.js'));
  assert.ok(installation>=0&&runtime>installation&&smoke>runtime);
  for(const index of [runtime,smoke]){
    assert.doesNotMatch(steps[index],/\|\|\s*true|continue-on-error:|^\s+if:/m);
    assert.match(steps[index],/inputs\.prod_url \|\| 'https:\/\/world-server\.mmmpaykin\.workers\.dev'/);
  }
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/deployment_status:/);
  assert.match(workflow,/cron: '23 \*\/6 \* \* \*'/);
  assert.match(workflow,/contents: read/);
});
