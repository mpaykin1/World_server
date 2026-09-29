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

// On Linux CI the ambient `bash` is correct. On a Windows host the ambient
// `bash` is WSL, which imports neither Windows environment variables nor
// Windows-path executables: the mocked `gh` on PATH would simply not be
// found and every gate run would abort on the first required variable. That
// failure is indistinguishable from a correct fail-closed exit, so the tests
// would be false greens. Prefer a real MSYS2/Git bash when one is installed.
const GIT_BASH_CANDIDATES=[
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
];
function resolveBash(){
  if(process.platform!=='win32') return 'bash';
  for(const candidate of GIT_BASH_CANDIDATES){
    if(fs.existsSync(candidate)) return candidate;
  }
  return 'bash';
}
const BASH=resolveBash();
const bashEnvProbe=spawnSync(BASH,['-c','test -n "${GITHUB_REPOSITORY:-}" && echo ok'],
  {encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'probe'}});
const BASH_INHERITS_ENV=bashEnvProbe.status===0;

function runBash(source,env,extraArgs=[]){
  return spawnSync(BASH,extraArgs,{encoding:'utf8',input:source,env});
}

test('workflow delegates Ocean eligibility to the fail-closed gate',()=>{
  assert.match(workflow,/pull-requests: read/);
  assert.match(workflow,/checks: read/);
  assert.match(workflow,/PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow,/bash scripts\/ocean-eligibility-gate\.sh/);
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

function runGate(sequence,{base='base-sha',master='base-sha',attempts='3',masterAfterReview='',headAfterReview='',reviews='',draft='false',mergeable='MERGEABLE',mergeState='clean',mergeableAfter='',mergeStateAfter=''}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-gate-'));
  const counter=path.join(dir,'counter');
  const gh=path.join(dir,'gh');
  fs.writeFileSync(gh,`#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/pulls/"* ]]; then
  if [[ -f "\$FAKE_COUNTER.any" ]]; then
    printf '${draft}\\t%s\\t%s\\tmaster\\t%s\\t%s\\n' "\${FAKE_HEAD_AFTER_REVIEW:-\$EXPECTED}" "\$FAKE_BASE" "\${FAKE_MERGEABLE_AFTER:-\$FAKE_MERGEABLE}" "\${FAKE_MERGE_STATE_AFTER:-\$FAKE_MERGE_STATE}"
  else
    printf '${draft}\\t%s\\t%s\\tmaster\\t%s\\t%s\\n' "\$EXPECTED" "\$FAKE_BASE" "\$FAKE_MERGEABLE" "\$FAKE_MERGE_STATE"
  fi
elif [[ "$args" == *"git/ref/heads/master"* ]]; then
  if [[ -f "\$FAKE_COUNTER.any" ]]; then
    printf '%s\\n' "\${FAKE_MASTER_AFTER_REVIEW:-\$FAKE_MASTER}"
  else
    printf '%s\\n' "\$FAKE_MASTER"
  fi
else
  check_name="absent"
  if [[ "$args" == *"World Independent Adversarial Review"* ]]; then
    check_name="World_Independent_Adversarial_Review"
  elif [[ "$args" == *"independent-review"* ]]; then
    check_name="independent-review"
  fi
  state=""
  IFS=';' read -ra pairs <<< "\${FAKE_REVIEW_MAP:-}"
  for pair in "\${pairs[@]}"; do
    if [[ "\$pair" == "\${check_name}="* ]]; then state="\${pair#*=}"; fi
  done
  cfile="\$FAKE_COUNTER.\$check_name"
  n=0; test ! -f "\$cfile" || n="\$(cat "\$cfile")"
  n=\$((n+1)); printf '%s' "\$n" > "\$cfile"
  printf '%s' "\$n" > "\$FAKE_COUNTER.any"
  if test -z "\$state"; then
    IFS=',' read -ra states <<< "\$FAKE_REVIEW_SEQUENCE"
    i=\$((n-1)); test "\$i" -lt "\${#states[@]}" || i=\$((\${#states[@]}-1))
    state="\${states[\$i]}"
  fi
  case "\$state" in
    success) printf 'completed\\tsuccess\\n' ;;
    failure) printf 'completed\\tfailure\\n' ;;
    inconclusive) printf 'completed\\taction_required\\n' ;;
    neutral) printf 'completed\\tneutral\\n' ;;
    *) printf 'in_progress\\t\\n' ;;
  esac
fi
`);
  fs.chmodSync(gh,0o755);
  // The gate is piped to bash on stdin rather than passed as a path: the exact
  // bytes on disk are what execute, and the test does not depend on how the
  // host maps Windows paths into its shell.
  const result=spawnSync(BASH,[],{
    encoding:'utf8',
    input:fs.readFileSync(path.join(root,'scripts/ocean-eligibility-gate.sh')),
    env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
      GITHUB_REPOSITORY:'owner/repo',PR_NUMBER:'320',EXPECTED:'head-sha',
      CERTIFIED:'head-sha',REVIEW_POLL_ATTEMPTS:attempts,REVIEW_POLL_SECONDS:'0',
      FAKE_BASE:base,FAKE_MASTER:master,FAKE_REVIEW_SEQUENCE:sequence,
      FAKE_REVIEW_MAP:reviews,
      FAKE_MERGEABLE:mergeable,FAKE_MERGE_STATE:mergeState,
      FAKE_MERGEABLE_AFTER:mergeableAfter,FAKE_MERGE_STATE_AFTER:mergeStateAfter,
      FAKE_MASTER_AFTER_REVIEW:masterAfterReview,FAKE_HEAD_AFTER_REVIEW:headAfterReview,
      FAKE_COUNTER:counter}
  });
  fs.rmSync(dir,{recursive:true,force:true});
  if(!BASH_INHERITS_ENV){
    throw new Error(`bash at "${BASH}" does not inherit environment variables; `+
      'gate behaviour cannot be asserted here and a fail-closed exit would be '+
      'indistinguishable from a real regression. Install Git for Windows or run on Linux CI.');
  }
  return result;
}

test('the gate test harness really executes the gate script',()=>{
  assert.equal(BASH_INHERITS_ENV,true,
    `bash at "${BASH}" must inherit exported variables, otherwise every `+
    'behavioural assertion below is a false green');
});

test('pending independent review can become success inside bounded poll',()=>{
  const result=runGate('pending,success');
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/READY_FOR_OCEAN=YES SHA=head-sha/);
});

test('stale master base fails closed',()=>{
  const result=runGate('success',{base:'old-base',master:'new-master'});
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
  const result=runGate('success',{base:'latest-master',master:'latest-master'});
  assert.equal(result.status,0,result.stderr);
});

test('a master advance during review polling invalidates an earlier PASS',()=>{
  const r=runGate('pending,success',{masterAfterReview:'concurrent-master'});
  assert.notEqual(r.status,0,'the initially matching master became stale');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});
test('a PR head change during polling invalidates an earlier PASS',()=>{
  const r=runGate('pending,success',{headAfterReview:'new-pr-head'});
  assert.notEqual(r.status,0,'the reviewed head differs from the live PR');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

/*
 * Regression guards for the real incident these tests exist for.
 *
 * On PR #352 head 95b16ec2933e4a5b4fc9b9af97366f881f287cd4 GitHub reported:
 *   independent-review                   = failure
 *   World Independent Adversarial Review = failure
 *   Ocean merge eligibility              = success
 * The gate compared two SHAs and echoed READY_FOR_OCEAN=YES unconditionally,
 * so two reviewer BLOCKs still produced a green light for the merge agent.
 * `git grep -icE "mergeable|mergeStateStatus" f95955d4 -- .github/ scripts/`
 * returned 0 hits: no gate in the repository knew whether a PR could merge.
 */

test('a doubly BLOCKED head never emits READY_FOR_OCEAN=YES',()=>{
  const r=runGate('success',{reviews:'independent-review=failure;World_Independent_Adversarial_Review=failure'});
  assert.notEqual(r.status,0,'a BLOCKed head must not be Ocean-eligible');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
  assert.match(r.stderr,/BLOCKED/,'report which check blocked, for triage');
});

test('one BLOCK alongside one PASS still fails closed',()=>{
  const r=runGate('success',{reviews:'independent-review=success;World_Independent_Adversarial_Review=failure'});
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
  const flipped=runGate('success',{reviews:'independent-review=failure;World_Independent_Adversarial_Review=success'});
  assert.notEqual(flipped.status,0);
  assert.doesNotMatch(flipped.stdout,/READY_FOR_OCEAN=YES/);
});

test('INCONCLUSIVE fails closed instead of being averaged into a PASS',()=>{
  const r=runGate('success',{reviews:'World_Independent_Adversarial_Review=inconclusive'});
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
  assert.match(r.stderr,/INCONCLUSIVE/);
});

test('neutral and other non-success conclusions fail closed',()=>{
  for(const state of ['neutral','other']){
    const r=runGate('success',{reviews:`World_Independent_Adversarial_Review=${state}`});
    assert.notEqual(r.status,0,state);
    assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/,state);
  }
});

test('both exact-head review checks are required, not just one',()=>{
  const r=runGate('success',{reviews:'World_Independent_Adversarial_Review=success;independent-review=absent'});
  assert.notEqual(r.status,0,'the second review check must be enforced too');
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
  assert.match(gate,/REQUIRED_REVIEWS=\("independent-review" "World Independent Adversarial Review"\)/);
  for(const name of ['independent-review','World Independent Adversarial Review']){
    assert(gate.includes(`"${name}"`),`gate must name the ${name} check`);
  }
});

test('the workflow no longer contains the unconditional tautology',()=>{
  assert.doesNotMatch(workflow,/echo ["']?READY_FOR_OCEAN=YES/,
    'only the fail-closed gate script may emit READY_FOR_OCEAN=YES');
  assert.doesNotMatch(workflow,/test -n "\$CERTIFIED"\s*\n\s*test "\$CERTIFIED" = "\$EXPECTED"\s*\n\s*echo/,
    'the old two-SHA comparison followed by an unconditional echo is removed');
});

test('the gate runs from trusted master so a PR cannot rewrite its own judge',()=>{
  const eligibility=workflow.split('ocean-eligibility:')[1];
  assert.ok(eligibility,'ocean-eligibility job exists');
  const checkout=eligibility.match(/- uses: actions\/checkout@v4[\s\S]*?ref: ([^\n]+)/);
  assert(checkout,'the gate job must check out the gate script');
  assert.doesNotMatch(checkout[1],/pull_request\.head\.sha/,
    'the judging script must not come from the candidate PR');
  assert.match(eligibility,/if: always\(\)/,
    'a failed Fleet PRE must report an explicit failing gate, not a silent skip');
});

test('a conflicting PR fails closed on mergeability',()=>{
  const conflicting=runGate('success',{mergeable:'CONFLICTING',mergeState:'dirty'});
  assert.notEqual(conflicting.status,0);
  assert.doesNotMatch(conflicting.stdout,/READY_FOR_OCEAN=YES/);
  assert.match(conflicting.stderr,/not mergeable/);
});

test('a merge conflict appearing during polling fails closed',()=>{
  const r=runGate('success',{mergeableAfter:'CONFLICTING',mergeStateAfter:'dirty'});
  assert.notEqual(r.status,0);
  assert.doesNotMatch(r.stdout,/READY_FOR_OCEAN=YES/);
});

test('a not-yet-computed mergeable state is never assumed safe',()=>{
  const pending=runGate('success',{mergeable:'',mergeState:'',attempts:'2'});
  assert.notEqual(pending.status,0,'an unevaluated mergeable must not grant eligibility');
  assert.doesNotMatch(pending.stdout,/READY_FOR_OCEAN=YES/);
});

test('the gate script is referenced by the workflow and is executable bash',()=>{
  assert.ok(fs.existsSync(path.join(root,'scripts/ocean-eligibility-gate.sh')));
  const source=fs.readFileSync(path.join(root,'scripts/ocean-eligibility-gate.sh'),'utf8');
  assert.match(source,/^#!\/usr\/bin\/env bash/);
  assert.match(source,/set -euo pipefail/);
  const syntax=runBash(
    fs.readFileSync(path.join(root,'scripts/ocean-eligibility-gate.sh')),
    {...process.env},['-n']);
  assert.equal(syntax.status,0,syntax.stderr);
});
