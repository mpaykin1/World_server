'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const R=process.cwd(),script=fs.readFileSync(path.join(R,'scripts','science-h4-critic-revision-ab-v2.cjs'),'utf8');
test('RUN_049 never uses client AbortController inside paired Ollama benchmark',()=>{assert.equal(script.includes('AbortController'),false)});
test('RUN_049 separates execution validity from hypothesis confirmation',()=>{assert.match(script,/hypothesisPass/);assert.match(script,/executionPass/);assert.match(script,/report\.pass=report\.executionPass&&report\.hypothesisPass/)});
test('collective stage failure is aggregated fail-closed',()=>{assert.match(script,/failed:Boolean\(draft\.failed\|\|critique\.failed\|\|revision\.failed\)/)});
test('completed RUN_049 is a valid negative result, not a false PASS',()=>{const r=JSON.parse(fs.readFileSync(path.join(R,'RUN_049_H4_CRITIC_REVISION_AB_NO_ABORT.json'),'utf8'));assert.equal(r.executionPass,true);assert.equal(r.hypothesisPass,false);assert.equal(r.pass,false);assert.equal(r.wins,0);assert.ok(r.medianLatencyRatio>3.5)});
