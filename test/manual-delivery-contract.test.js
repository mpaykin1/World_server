'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');

test('manual delivery policy makes verified Netlify link the only normal terminal result',()=>{
  const p=JSON.parse(read('data/manual-delivery-policy.json'));
  assert.equal(p.mode,'VERIFIED_LINK_ONLY');
  assert.equal(p.canonicalProductionOrigin,'https://world-server.netlify.app');
  assert.equal(p.canonicalWorldHub,'https://world-server.netlify.app/apps/voxel-world/');
  assert.equal(p.manualFastLane.blockerMeansContinue,true);
  assert.equal(p.manualFastLane.autoMergeAfterRequiredChecksAndIndependentReview,true);
  assert.equal(p.manualFastLane.autoDeployToCanonicalNetlifyAfterMerge,true);
  assert.ok(p.forbiddenFinalOutputsWhileResolvable.includes('progress-report'));
  assert.ok(p.forbiddenFinalOutputsWhileResolvable.includes('unverified-url'));
  assert.deepEqual(p.terminalStates,['LIVE_VERIFIED','USER_ACTION_REQUIRED']);
});

test('fresh-chat contracts point to the executable verified-link gate',()=>{
  const control=read('CHATGPT_GAME_CONTROL.md'); const start=read('AI_START_HERE.md'); const agents=read('AGENTS.md');
  for(const text of [control,start,agents]) assert.ok(text.includes('data/manual-delivery-policy.json'));
  assert.ok(control.includes('npm run delivery:verify'));
  assert.ok(control.includes('world-server.netlify.app'));
});
