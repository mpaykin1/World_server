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

function runGate(sequence,{base='base-sha',master='base-sha',attempts='3'}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocean-gate-'));
  const counter=path.join(dir,'counter');
  const gh=path.join(dir,'gh');
  fs.writeFileSync(gh,`#!/usr/bin/env bash
set -euo pipefail
args="$*"
if [[ "$args" == *"/pulls/"* ]]; then
  printf 'false\\t%s\\t%s\\tmaster\\n' "$EXPECTED" "$FAKE_BASE"
elif [[ "$args" == *"git/ref/heads/master"* ]]; then
  printf '%s\\n' "$FAKE_MASTER"
else
  n=0; test ! -f "$FAKE_COUNTER" || n="$(cat "$FAKE_COUNTER")"
  n=$((n+1)); printf '%s' "$n" > "$FAKE_COUNTER"
  IFS=',' read -ra states <<< "$FAKE_REVIEW_SEQUENCE"
  i=$((n-1)); test "$i" -lt "\${#states[@]}" || i=$((\${#states[@]}-1))
  case "\${states[$i]}" in
    success) printf 'completed\\tsuccess\\n' ;;
    failure) printf 'completed\\tfailure\\n' ;;
    *) printf 'in_progress\\t\\n' ;;
  esac
fi
`);
  fs.chmodSync(gh,0o755);
  const result=spawnSync('bash',[path.join(root,'scripts/ocean-eligibility-gate.sh')],{
    encoding:'utf8',env:{...process.env,PATH:dir+path.delimiter+process.env.PATH,
      GITHUB_REPOSITORY:'owner/repo',PR_NUMBER:'320',EXPECTED:'head-sha',
      CERTIFIED:'head-sha',REVIEW_POLL_ATTEMPTS:attempts,REVIEW_POLL_SECONDS:'0',
      FAKE_BASE:base,FAKE_MASTER:master,FAKE_REVIEW_SEQUENCE:sequence,
      FAKE_COUNTER:counter}
  });
  fs.rmSync(dir,{recursive:true,force:true});
  return result;
}

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
