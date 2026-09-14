'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');

// Merge-resilience regression: preserve master completion rules while adding the executable delivery gate.
test('manual delivery policy makes a verified canonical link the only normal terminal result',()=>{
  const p=JSON.parse(read('data/manual-delivery-policy.json'));
  assert.equal(p.mode,'VERIFIED_LINK_ONLY');
  assert.equal(p.canonicalProvider,'cloudflare');
  assert.equal(p.deploymentIdentity,'data/cloudflare-deployment-identity.json');
  assert.equal(p.canonicalProductionOriginSource,'WORLD_SERVER_CANONICAL_ORIGIN');
  assert.equal(p.canonicalWorldHubPath,'/apps/voxel-world/');
  assert.equal(p.canonicalPublicHost,'https://world-server.netlify.app');
  assert.ok(Array.isArray(p.canonicalPublicVerifiedPaths));
  assert.ok(p.canonicalPublicVerifiedPaths.includes('/apps/voxel-world/'));
  assert.ok(p.canonicalPublicVerifiedPaths.includes('/shared/world-fusion.html'));
  assert.equal(p.manualFastLane.blockerMeansContinue,true);
  assert.equal(p.manualFastLane.autoMergeAfterRequiredChecksAndIndependentReview,true);
  assert.equal(p.manualFastLane.autoDeployToCanonicalCloudflareAfterMerge,true);
  assert.ok(p.forbiddenFinalOutputsWhileResolvable.includes('progress-report'));
  assert.ok(p.forbiddenFinalOutputsWhileResolvable.includes('unverified-url'));
  assert.deepEqual(p.terminalStates,['LIVE_VERIFIED','USER_ACTION_REQUIRED']);
});

test('fresh-chat contracts point to executable verified-link completion without weakening master rules',()=>{
  const control=read('CHATGPT_GAME_CONTROL.md');
  const start=read('AI_START_HERE.md');
  const agents=read('AGENTS.md');
  for(const text of [control,start]) assert.ok(text.includes('data/manual-delivery-policy.json'));
  assert.ok(control.includes('npm run delivery:verify'));
  assert.ok(control.includes('data/cloudflare-deployment-identity.json'));
  assert.ok(control.includes('world-server.netlify.app'));
  assert.ok(control.includes('world-fusion.html'));
  assert.ok(control.includes('Builder -> Fleet PRE -> Ocean -> Fleet POST'));
  assert.equal(control.includes('Release independently'),false);
  assert.ok(agents.includes('MANUAL TASK COMPLETION CONTRACT'));
  assert.ok(agents.includes('data/manual-task-completion-contract.json'));
  assert.ok(agents.includes('stable production URL'));
});

test('canonical public host and Netlify deploy-preview aliases are clearly separated',()=>{
  const policy=read('data/manual-delivery-policy.json');
  const audit=read('data/manual-task-completion-contract.json');
  assert.ok(policy.includes('"canonicalPublicHost": "https://world-server.netlify.app"'));
  assert.ok(policy.includes('/shared/world-fusion.html'));
  assert.ok(JSON.parse(audit).forbiddenFinalUrlPatterns.includes('--world-server.netlify.app'));
  assert.ok(JSON.parse(audit).forbiddenFinalUrlPatterns.includes('deploy-preview-'));
  for(const file of ['AI_START_HERE.md','.ai/project-context-index.json','CHATGPT_GAME_CONTROL.md']){
    const text=read(file);
    assert.ok(text.includes('world-server.netlify.app'),`${file} must name the canonical public host`);
  }
});

test('Cloudflare exact-head preview is fail-closed and exercises the target stack',()=>{
  const workflow=read('.github/workflows/cloudflare-preview.yml');
  const smoke=read('scripts/verify-cloudflare-stack.cjs');
  assert.ok(workflow.includes('CLOUDFLARE_API_TOKEN'));
  assert.ok(workflow.includes('WORLD_SERVER_DEPLOYED_SHA:${GITHUB_SHA}'));
  assert.ok(workflow.includes('verify-cloudflare-stack.cjs'));
  assert.ok(workflow.includes('--expected-sha="$GITHUB_SHA"'));
  for(const path of ['/api/config','/api/apps?all=1','/api/worlds','/api/world-factory','/api/canon','/api/voxel']) assert.ok(smoke.includes(path));
  assert.ok(smoke.includes('status !== 401'));
});
