'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {finalizeVerification:check}=require('../scripts/task-integrity.cjs');
const aggregate=()=>({telemetry_balanced:true,measurement_verified:false,
 latest_artifacts:{CLEAN_SERVER:null,'GRAPHICS-DEMO-001':null},status:'TELEMETRY_BALANCED_UNVERIFIED',ok:true});
test('evidence budget must remain unverified with explicit recovery',()=>{
 const a=check(aggregate(),[{status:'CONTENT_VERIFIED'},
  {status:'CONTENT_UNVERIFIED',reason:'EVIDENCE_CHECK_LIMIT_REACHED'}]);
 assert.equal(a.evidence_check_limit_reached,true);
 assert.equal(a.evidence_verified,false);assert.equal(a.verification_pass,false);
 assert.equal(a.status,'TELEMETRY_BALANCED_UNVERIFIED');
 assert.match(a.recovery_action,/EVIDENCE_CHECK_LIMIT_REACHED/);
});
test('invalid evidence cannot be promoted to telemetry balance',()=>{
 const a=check(aggregate(),[{status:'INVALID',reason:'HASH_REF_MISMATCH'}]);
 assert.equal(a.status,'INVALID_EVIDENCE');assert.equal(a.ok,false);
 assert.equal(a.verification_pass,false);assert.equal(a.evidence_check_limit_reached,false);
 assert.match(a.recovery_action,/INVALID_EVIDENCE.*FIX_SOURCE_REF_OR_HASH/);
});
test('invalid source hash overrides bounded-budget diagnostic while preserving both evidence flags',()=>{
 const a=check(aggregate(),[{status:'INVALID',reason:'HASH_REF_MISMATCH'},
  {status:'CONTENT_UNVERIFIED',reason:'EVIDENCE_CHECK_LIMIT_REACHED'}]);
 assert.equal(a.status,'INVALID_EVIDENCE');assert.equal(a.ok,false);
 assert.equal(a.evidence_check_limit_reached,true);
 assert.match(a.recovery_action,/INVALID_EVIDENCE.*FIX_SOURCE_REF_OR_HASH/);
 assert.equal(a.verification_pass,false);
});
