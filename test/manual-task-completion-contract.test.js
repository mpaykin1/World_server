'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../lib/manual-task-completion-contract');
const coordinator=require('../scripts/master-coordinator.cjs');

test('Finish Mode freezes scope at 70 percent',()=>{
  assert.equal(contract.isFinishMode(.69),false);
  assert.equal(contract.isFinishMode(.70),true);
  assert.equal(contract.scopeChangeAllowed({progress:.70,kind:'scope-expansion'}),false);
  assert.equal(contract.scopeChangeAllowed({progress:.70,kind:'deploy-preview'}),true);
});

test('link request cannot finish before browser-verified preview',()=>{
  const partial={commit:'abc',pushed:true,previewUrl:'https://preview.example'};
  const gate=contract.validateDelivery(partial);
  assert.equal(gate.ok,false);
  assert.deepEqual(gate.missing,['browserVerified']);
});

test('cosmetic defects do not block preview, blockers do',()=>{
  const base={commit:'abc',pushed:true,previewUrl:'https://preview.example',browserVerified:true};
  assert.equal(contract.validateDelivery({...base,defects:[{severity:'COSMETIC'}]}).ok,true);
  assert.equal(contract.validateDelivery({...base,defects:[{severity:'BLOCKER'}]}).ok,false);
});

test('master coordinator cannot return PASS for manual link task without delivery evidence',async()=>{
  const dispatchFn=async(_root,task)=>({taskId:task.taskId,agentId:task.agent,result:'PASS',ok:true});
  const common={root:process.cwd(),skipNetwork:true,dispatchFn,manualTask:true,requireLink:true};
  const pending=await coordinator.runMasterGoal('ship a test link',[{taskId:'t',agent:'openhuman',text:'verify'}],common);
  assert.equal(pending.overallStatus,'PENDING');
  assert.ok(pending.deliveryGate.missing.includes('previewUrl'));
  const done=await coordinator.runMasterGoal('ship a test link',[{taskId:'t2',agent:'openhuman',text:'verify'}],{
    ...common,deliveryEvidence:{commit:'abc',pushed:true,previewUrl:'https://preview.example',browserVerified:true}
  });
  assert.equal(done.overallStatus,'PASS');
  assert.equal(done.deliveryGate.status,'PREVIEW_VERIFIED');
});
