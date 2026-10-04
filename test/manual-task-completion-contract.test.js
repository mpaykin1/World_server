'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../lib/manual-task-completion-contract');
const coordinator=require('../scripts/master-coordinator.cjs');

const live={
  commit:'abc',pushed:true,mergedToDefault:true,productionDeployed:true,
  productionUrl:'https://world-server.netlify.app/apps/voxel-world/',
  exactUrlHttp200x3:true,featureMarkerVerified:true,
  mobileBrowserVerified:true,finalRecheckVerified:true
};

test('Finish Mode freezes scope at 70 percent',()=>{
  assert.equal(contract.isFinishMode(.69),false);
  assert.equal(contract.isFinishMode(.70),true);
  assert.equal(contract.scopeChangeAllowed({progress:.70,kind:'scope-expansion'}),false);
  assert.equal(contract.scopeChangeAllowed({progress:.70,kind:'deploy-production'}),true);
});

test('preview URL can never satisfy final user-link delivery',()=>{
  const preview={...live,productionUrl:'https://deploy-preview-98--world-server.netlify.app/apps/voxel-world/'};
  const gate=contract.validateDelivery(preview);
  assert.equal(gate.ok,false);
  assert.ok(gate.missing.includes('stableProductionUrl'));
});

test('stable production link requires every final verification signal',()=>{
  const partial={...live,finalRecheckVerified:false};
  assert.deepEqual(contract.validateDelivery(partial).missing,['finalRecheckVerified']);
  assert.equal(contract.validateDelivery(live).status,'LIVE_VERIFIED');
});
test('master coordinator cannot PASS a manual link task before stable production verification',async()=>{
  const dispatchFn=async(_root,task)=>({taskId:task.taskId,agentId:task.agent,result:'PASS',ok:true});
  const common={root:process.cwd(),skipNetwork:true,dispatchFn,manualTask:true,requireLink:true};
  const pending=await coordinator.runMasterGoal('ship a permanent link',[{taskId:'t',agent:'openhuman',text:'verify'}],common);
  assert.equal(pending.overallStatus,'PENDING');
  assert.ok(pending.deliveryGate.missing.includes('productionUrl'));
  const done=await coordinator.runMasterGoal('ship a permanent link',[{taskId:'t2',agent:'openhuman',text:'verify'}],{
    ...common,deliveryEvidence:live
  });
  assert.equal(done.overallStatus,'PASS');
  assert.equal(done.deliveryGate.status,'LIVE_VERIFIED');
});


test('temporary preview link is allowed for user testing only after fresh live verification',()=>{
  const good={
    previewUrl:'https://world-server-pr-401.example.workers.dev/apps/infinite-gothic-traversal/',
    exactUrlHttp200x3:true,
    featureMarkerVerified:true,
    desktopBrowserVerified:true,
    mobileBrowserVerified:true,
    finalRecheckVerified:true,
    finalRecheckAgeSeconds:18,
    urlSource:'deploy-output',
    onlyHostStatus:false,
  };
  assert.deepEqual(contract.validatePreviewTestLink(good),{ok:true,missing:[],status:'LIVE_VERIFIED_FRESH'});

  const stale={...good,finalRecheckAgeSeconds:121};
  assert.equal(contract.validatePreviewTestLink(stale).status,'UNVERIFIED_LINK');
  assert.ok(contract.validatePreviewTestLink(stale).missing.includes('finalRecheckAgeSeconds<=120'));

  const guessed={...good,urlSource:'guessed'};
  assert.ok(contract.validatePreviewTestLink(guessed).missing.includes('nonGuessedPreviewUrl'));

  const hostStatusOnly={previewUrl:good.previewUrl,onlyHostStatus:true,finalRecheckAgeSeconds:5};
  const blocked=contract.validatePreviewTestLink(hostStatusOnly);
  assert.equal(blocked.ok,false);
  assert.ok(blocked.missing.includes('liveUrlProbe'));
});
