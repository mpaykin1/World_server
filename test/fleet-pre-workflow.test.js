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
  expected=HEAD,draft='false',duplicateCommand='true',priorSuccess=false}={}){
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
  # Real GitHub shape: raw check-runs JSON, not a pre-selected row, so the
  # production selector actually runs on every test in this suite.
  printf '{"check_runs":['
  sep=''
  if test "$FAKE_PRIOR_SUCCESS" = 1; then
    printf '{"id":100,"name":"World Independent Adversarial Review","status":"completed","conclusion":"success"}'
    sep=','
  fi
  for ((k=0;k<=i;k++)); do
    case "\${states[$k]}" in
      success) row='"status":"completed","conclusion":"success"' ;;
      failure) row='"status":"completed","conclusion":"failure"' ;;
      inconclusive) row='"status":"completed","conclusion":"action_required"' ;;
      queued) row='"status":"queued","conclusion":null' ;;
      *) row='"status":"in_progress","conclusion":null' ;;
    esac
    printf '%s{"id":%d,"name":"World Independent Adversarial Review",%s}' "$sep" "$((200+k))" "$row"
    sep=','
  done
  printf ']}\\n'
fi
`);
  fs.chmodSync(gh,0o755);
  const result=spawnSync('bash',[path.join(root,'scripts/ocean-eligibility-gate.sh')],{
    encoding:'utf8',env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
      GITHUB_REPOSITORY:'owner/repo',PR_NUMBER:'320',EXPECTED:expected,
      CERTIFIED:certified,REVIEW_POLL_ATTEMPTS:attempts,REVIEW_POLL_SECONDS:'0',
      OCEAN_DUPLICATE_COMMAND:duplicateCommand,
      FAKE_BASE:base,FAKE_MASTER:master,FAKE_REVIEW_SEQUENCE:sequence,
      FAKE_PRIOR_SUCCESS:priorSuccess?'1':'0',
      FAKE_MERGEABLE:mergeable,FAKE_MERGEABLE_AFTER_REVIEW:mergeableAfterReview||mergeable,
      FAKE_DRAFT:draft,FAKE_MASTER_AFTER_REVIEW:masterAfterReview,
      FAKE_HEAD_AFTER_REVIEW:headAfterReview,FAKE_COUNTER:counter}
  });
  fs.rmSync(dir,{recursive:true,force:true});
  // If bash could not execute the gate at all it exits non-zero for the wrong
  // reason, which would silently satisfy every fail-closed assertion below and
  // turn this whole file into a false green. Refuse to report on that.
  assert.equal(result.error,undefined,
    `bash could not execute the gate (${result.error&&result.error.code}); `+
    'the fail-closed assertions below would be meaningless');
  assert.doesNotMatch(result.stderr,/No such file or directory/,
    'bash could not resolve the gate script, so its non-zero exit proves nothing');
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

// Executes the production selector the gate itself calls. Hermetic by
// construction: it needs Node, which the gate already requires through its
// canonical duplicate review, and never the optional jq binary, so it cannot
// degrade into a silent skip on a jq-less host.
const SELECTOR=path.join(root,'scripts','ocean-review-select.js');
function selectRuns(runs){
  return spawnSync(process.execPath,[SELECTOR],{
    encoding:'utf8',input:JSON.stringify({check_runs:[
      ...runs.map(r=>({name:'World Independent Adversarial Review',...r}))
    ]})
  });
}

test('the exact-head review selection is hermetic and never depends on a jq binary',()=>{
  assert.ok(fs.existsSync(SELECTOR),
    'the version-controlled selector the gate calls must exist');
  assert.match(gate,/ocean-review-select\.js/);
  assert.doesNotMatch(gate,/check-runs[\s\S]{0,240}--jq/,
    'selecting the review must not require the optional jq binary, or its guard silently skips');
  assert.doesNotMatch(fs.readFileSync(__filename,'utf8'),/t\.skip\(/,
    'a skipped guard is a false green under AGENTS.md section 10');
});

test('newest independent check ID supersedes an older success even while queued',()=>{
  const selected=selectRuns([
    {id:900,status:'completed',conclusion:'success',started_at:'2026-09-27T02:00:00Z'},
    {id:901,status:'queued',conclusion:null,started_at:null}
  ]);
  assert.equal(selected.status,0,selected.stderr);
  assert.match(selected.stdout,/^queued/);
  assert.doesNotMatch(selected.stdout,/success/);
  const r=runGate('queued',{priorSuccess:true,attempts:'2'});
  assert.notEqual(r.status,0,'a queued rerun superseded the reviewed PASS');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

test('newest independent failed review supersedes prior success',()=>{
  const selected=selectRuns([
    {id:15,status:'completed',conclusion:'success',started_at:'2026-09-27T02:00:00Z'},
    {id:16,status:'completed',conclusion:'failure',started_at:'2026-09-27T02:01:00Z'}
  ]);
  assert.equal(selected.status,0,selected.stderr);
  assert.match(selected.stdout,/^completed\tfailure/);
  const r=runGate('failure',{priorSuccess:true});
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

test('the selector takes the newest id, not the first match',()=>{
  const newerPass=selectRuns([
    {id:15,status:'completed',conclusion:'failure'},
    {id:16,status:'completed',conclusion:'success'}
  ]);
  assert.equal(newerPass.status,0,newerPass.stderr);
  assert.match(newerPass.stdout,/^completed\tsuccess/);
  const olderPass=selectRuns([
    {id:15,status:'completed',conclusion:'success'},
    {id:16,status:'completed',conclusion:'failure'}
  ]);
  assert.match(olderPass.stdout,/^completed\tfailure/);
});

test('an absent or unrelated check-run set is absent, never a pass',()=>{
  const empty=selectRuns([]);
  assert.equal(empty.status,0,empty.stderr);
  assert.equal(empty.stdout,'absent\t\n');
  const unrelated=spawnSync(process.execPath,[SELECTOR],{
    encoding:'utf8',input:JSON.stringify({check_runs:[
      {id:7,name:'Ocean merge eligibility',status:'completed',conclusion:'success'}
    ]})
  });
  assert.equal(unrelated.status,0,unrelated.stderr);
  assert.equal(unrelated.stdout,'absent\t\n');
});

test('the selector fails closed on an unusable payload instead of inventing a verdict',()=>{
  for(const payload of ['not json at all',JSON.stringify([]),JSON.stringify({total_count:1})]){
    const result=spawnSync(process.execPath,[SELECTOR],{encoding:'utf8',input:payload});
    assert.notEqual(result.status,0,payload);
    assert.doesNotMatch(result.stdout,/completed/);
  }
});

// Recorded live state, not synthetic. Fleet PRE and Ocean both read PR #352 at
// head 95b16ec2 on 2026-09-30: the exact-head "World Independent Adversarial
// Review" had concluded failure, and the gate that shipped on master still
// certified that same head READY_FOR_OCEAN=YES. That is the exact BEFORE state
// this guard exists to reject.
const RECORDED_352_FAILURE={id:36652535133,
  name:'World Independent Adversarial Review',status:'completed',conclusion:'failure',
  completed_at:'2026-09-30T00:56:12Z'};

test('recorded live case: a failed exact-head review is not Ocean eligible',()=>{
  const selected=spawnSync(process.execPath,[SELECTOR],{
    encoding:'utf8',input:JSON.stringify({check_runs:[RECORDED_352_FAILURE]})
  });
  assert.equal(selected.status,0,selected.stderr);
  assert.match(selected.stdout,/^completed\tfailure/);
  const r=runGate('failure');
  assert.notEqual(r.status,0,'the recorded live BLOCK must stay blocked');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

test('negative control: the pre-fix tautology certifies the recorded BLOCK, so the guard discriminates',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-tautology-'));
  const script=path.join(dir,'tautology.sh');
  fs.writeFileSync(script,`set -euo pipefail
test -n "$CERTIFIED"
test "$CERTIFIED" = "$EXPECTED"
echo "READY_FOR_OCEAN=YES SHA=$CERTIFIED"
`);
  const before=spawnSync('bash',[script],{
    encoding:'utf8',env:{...process.env,CERTIFIED:HEAD,EXPECTED:HEAD}
  });
  fs.rmSync(dir,{recursive:true,force:true});
  assert.equal(before.status,0,before.stderr);
  assert.match(before.stdout,/READY_FOR_OCEAN=YES/,
    'the pre-fix predicate reads no review and certifies the recorded BLOCK; if this stops holding the fixture no longer discriminates');
  const after=runGate('failure');
  assert.notEqual(after.status,0,
    'the new predicate must reject what the pre-fix predicate accepted');
  assert.doesNotMatch(after.stdout,/READY_FOR_OCEAN=YES/);
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
