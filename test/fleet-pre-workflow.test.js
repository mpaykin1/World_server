'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const root=path.join(__dirname,'..');
const workflow=fs.readFileSync(path.join(root,
  '.github/workflows/fleet-pre-exact-sha.yml'),'utf8');
const gate=fs.readFileSync(path.join(root,
  'scripts/ocean-eligibility-gate.sh'),'utf8');
const HEAD='a'.repeat(40),MASTER='b'.repeat(40),OTHER_MASTER='c'.repeat(40);

test('workflow delegates Ocean eligibility to the fail-closed gate',()=>{
  assert.match(workflow,/pull-requests: read/);
  assert.match(workflow,/checks: read/);
  assert.match(workflow,/PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow,/bash scripts\/ocean-eligibility-gate\.sh/);
});

test('Ocean eligibility job checks out and provisions the exact candidate head',()=>{
  const job=workflow.slice(workflow.indexOf('  ocean-eligibility:'));
  assert.match(job,/actions\/checkout@v4/,
    'the gate is version-controlled; without a checkout it exits 127');
  assert.match(job,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(job,/persist-credentials: false/);
  assert.match(job,/actions\/setup-node@v4/);
  assert.match(job,/node-version: 24/);
  assert.ok(job.indexOf('actions/checkout@v4')<job.indexOf('ocean-eligibility-gate.sh'),
    'checkout must precede gate execution');
});

test('gate binds current non-draft PR head and current master base',()=>{
  assert.match(gate,/\.draft, \.head\.sha, \.base\.sha, \.base\.ref/);
  assert.match(gate,/test "\$DRAFT" = false/);
  assert.match(gate,/test "\$PR_HEAD" = "\$EXPECTED"/);
  assert.match(gate,/git\/ref\/heads\/master/);
  assert.match(gate,/test "\$BASE_SHA" = "\$CURRENT_MASTER"/);
});

test('gate polls exact independent check and only accepts completed success',()=>{
  assert.match(gate,/World Independent Adversarial Review/);
  assert.match(gate,/attempt<=POLL_ATTEMPTS/);
  assert.match(gate,/test "\$STATUS" = completed/);
  assert.match(gate,/test "\$CONCLUSION" = success/);
  assert(gate.indexOf('test "$CONCLUSION" = success')<
    gate.indexOf('READY_FOR_OCEAN=YES'));
});

test('gate rejects unresolved conflicts and an unresolvable rollback target',()=>{
  assert.match(gate,/\(\.mergeable\|tostring\)/);
  assert.match(gate,/test "\$FINAL_MERGEABLE" = true/);
  assert.match(gate,/Rollback target \(master tip\) unresolvable/);
  assert(gate.indexOf('test "$FINAL_MERGEABLE" = true')<
    gate.indexOf('READY_FOR_OCEAN=YES'),
    'mergeable must be revalidated before certification, not after');
  assert.ok(gate.indexOf('echo "ROLLBACK_LKG=$CURRENT_MASTER"')>
    gate.indexOf('[[ "$CURRENT_MASTER" =~ $SHA40 ]]'),
    'a rollback target is emitted only after it is proven resolvable');
});

test('gate reuses the canonical duplicate review instead of a second detector',()=>{
  assert.match(gate,/OCEAN_DUPLICATE_COMMAND:-node scripts\/duplicate-system-review\.js/);
  assert.ok(fs.existsSync(path.join(root,'scripts','duplicate-system-review.js')),
    'the canonical duplicate review must exist');
  assert.doesNotMatch(gate,/forbiddenPatterns|duplicate-code/,
    'the gate must not reimplement duplicate detection');
});

function runGate(sequence,{base=MASTER,master=MASTER,attempts='3',masterAfterReview='',
  headAfterReview='',mergeable='true',mergeableAfterReview='',certified=HEAD,
  expected=HEAD,draft='false',duplicateCommand='true'}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-gate-'));
  const counter=path.join(dir,'counter');
  const gh=path.join(dir,'gh');
  fs.writeFileSync(gh,`#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/pulls/"* ]]; then
  head="$EXPECTED"; mg="$FAKE_MERGEABLE"
  if [[ -f "$FAKE_COUNTER" ]]; then
    if [[ -n "$FAKE_HEAD_AFTER_REVIEW" ]]; then head="$FAKE_HEAD_AFTER_REVIEW"; fi
    if [[ -n "$FAKE_MERGEABLE_AFTER_REVIEW" ]]; then mg="$FAKE_MERGEABLE_AFTER_REVIEW"; fi
  fi
  printf '%s\\t%s\\t%s\\tmaster\\t%s\\n' "$FAKE_DRAFT" "$head" "$FAKE_BASE" "$mg"
elif [[ "$args" == *"git/ref/heads/master"* ]]; then
  if [[ -f "$FAKE_COUNTER" && -n "$FAKE_MASTER_AFTER_REVIEW" ]]; then
  printf '%s\\n' "$FAKE_MASTER_AFTER_REVIEW"
  else
  printf '%s\\n' "$FAKE_MASTER"
  fi
else
  n=0; test ! -f "$FAKE_COUNTER" || n="$(cat "$FAKE_COUNTER")"
  n=$((n+1)); printf '%s' "$n" > "$FAKE_COUNTER"
  IFS=',' read -ra states <<< "$FAKE_REVIEW_SEQUENCE"
  i=$((n-1)); test "$i" -lt "\${#states[@]}" || i=$((\${#states[@]}-1))
  case "\${states[$i]}" in
    success) printf 'completed\\tsuccess\\n' ;;
    failure) printf 'completed\\tfailure\\n' ;;
    inconclusive) printf 'completed\\taction_required\\n' ;;
    *) printf 'in_progress\\t\\n' ;;
  esac
fi
`);
  fs.chmodSync(gh,0o755);
  const result=spawnSync('bash',[path.join(root,'scripts/ocean-eligibility-gate.sh')],{
    encoding:'utf8',env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
      GITHUB_REPOSITORY:'owner/repo',PR_NUMBER:'320',EXPECTED:expected,
      CERTIFIED:certified,REVIEW_POLL_ATTEMPTS:attempts,REVIEW_POLL_SECONDS:'0',
      OCEAN_DUPLICATE_COMMAND:duplicateCommand,
      FAKE_BASE:base,FAKE_MASTER:master,FAKE_REVIEW_SEQUENCE:sequence,
      FAKE_MERGEABLE:mergeable,FAKE_MERGEABLE_AFTER_REVIEW:mergeableAfterReview||mergeable,
      FAKE_DRAFT:draft,FAKE_MASTER_AFTER_REVIEW:masterAfterReview,
      FAKE_HEAD_AFTER_REVIEW:headAfterReview,FAKE_COUNTER:counter}
  });
  fs.rmSync(dir,{recursive:true,force:true});
  return result;
}

test('pending independent review can become success inside bounded poll',()=>{
  const result=runGate('pending,success');
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,new RegExp(`READY_FOR_OCEAN=YES SHA=${HEAD}`));
});

test('a certified candidate reports its rollback target',()=>{
  const result=runGate('success');
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,new RegExp(`ROLLBACK_LKG=${MASTER}`));
  assert.ok(result.stdout.indexOf('ROLLBACK_LKG=')<
    result.stdout.indexOf('READY_FOR_OCEAN=YES'),
    'rollback must be published with the certificate');
});

test('a malformed or stale Fleet certificate fails closed before any API call',()=>{
  for(const certified of ['not-a-sha','',HEAD.replace(/a$/,'b')]){
    const result=runGate('success',{certified});
    assert.notEqual(result.status,0,certified);
    assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/,certified);
  }
});

test('an inconclusive independent review is not an approval',()=>{
  const result=runGate('inconclusive',{attempts:'2'});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('stale master base fails closed',()=>{
  const result=runGate('success',{base:OTHER_MASTER,master:MASTER});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('a malformed PR base ref fails closed',()=>{
  const result=runGate('success',{base:'old-base',master:OTHER_MASTER});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('an unresolvable master tip fails closed instead of merging without a rollback',()=>{
  const result=runGate('success',{master:'not-a-sha'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Rollback target \(master tip\) unresolvable/);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('a draft PR is never Ocean eligible',()=>{
  const result=runGate('success',{draft:'true'});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('an unresolved conflict fails closed',()=>{
  for(const mergeable of ['false','null']){
    const result=runGate('success',{mergeable});
    assert.notEqual(result.status,0,mergeable);
    assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/,mergeable);
  }
});

test('a conflict appearing during review polling invalidates an earlier PASS',()=>{
  const r=runGate('pending,success',{mergeable:'true',mergeableAfterReview:'false'});
  assert.notEqual(r.status,0,'the reviewed PR became unmergeable');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

test('duplicate or parallel system blockers fail closed',()=>{
  const result=runGate('success',{duplicateCommand:'false'});
  assert.notEqual(result.status,0);
  assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/);
});

test('review timeout and completed non-success both fail closed',()=>{
  for(const sequence of ['pending','failure']){
    const result=runGate(sequence,{attempts:'2'});
    assert.notEqual(result.status,0,sequence);
    assert.doesNotMatch(result.stdout,/READY_FOR_OCEAN=YES/,sequence);
  }
});

test('newest independent check ID supersedes an older success even while queued',t=>{
  const selector=gate.match(/--jq '(\[\.check_runs\[\][^\n]+)'/);
  assert(selector,'Read the production GitHub jq selector');
  assert.match(selector[1],/sort_by\(\.id\)/);
  const jq=spawnSync('jq',['-r',selector[1]],{
    encoding:'utf8',input:JSON.stringify({check_runs:[
      {id:900, name:'World Independent Adversarial Review',status:'completed',
        conclusion:'success',started_at:'2026-09-27T02:00:00Z'},
      {id:901, name:'World Independent Adversarial Review',status:'queued',
        conclusion:null,started_at:null}
    ]})
  });
  if(jq.error?.code==='ENOENT'){t.skip('jq unavailable in this host');return;}
  assert.equal(jq.status,0,jq.stderr);
  assert.match(jq.stdout,/^queued(?:\t|\r?\n)/);
  assert.doesNotMatch(jq.stdout,/success/);
});
test('newest independent failed review supersedes prior success',t=>{
  const selector=gate.match(/--jq '(\[\.check_runs\[\][^\n]+)'/);
  assert(selector);
  const jq=spawnSync('jq',['-r',selector[1]],{
    encoding:'utf8',input:JSON.stringify({check_runs:[
      {id:15,name:'World Independent Adversarial Review',
        status:'completed',conclusion:'success',started_at:'2026-09-27T02:00:00Z'},
      {id:16,name:'World Independent Adversarial Review',
        status:'completed',conclusion:'failure',started_at:'2026-09-27T02:01:00Z'}
    ]})
  });
  if(jq.error?.code==='ENOENT'){t.skip('jq unavailable in this host');return;}
  assert.equal(jq.status,0,jq.stderr);
  assert.match(jq.stdout,/^completed\tfailure/);
});

test('independent reviewer is a separate trusted workflow publishing the exact-head check',()=>{
  const independent=fs.readFileSync(path.join(root,
    '.github/workflows/independent-pr-review.yml'),'utf8');
  assert.match(independent,/pull_request_target:/);
  assert.match(independent,/workflow_dispatch:/);
  assert.match(independent,/World Independent Adversarial Review/);
  assert.match(independent,/head_sha="\$HEAD_SHA"/);
  assert.match(gate,/independent-pr-review\.yml/);
});
test('freshly rebased PR matching current master is eligible after a real review PASS',()=>{
  const result=runGate('success');
  assert.equal(result.status,0,result.stderr);
});

test('a master advance during review polling invalidates an earlier PASS',()=>{
  const r=runGate('pending,success',{masterAfterReview:'concurrent-master'});
  assert.notEqual(r.status,0,'the initially matching master became stale');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});
test('a PR head change during polling invalidates an earlier PASS',()=>{
  const r=runGate('pending,success',{headAfterReview:'d'.repeat(40)});
  assert.notEqual(r.status,0,'the reviewed head differs from the live PR');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});
