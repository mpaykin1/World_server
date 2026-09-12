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
