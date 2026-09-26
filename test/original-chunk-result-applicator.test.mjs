import test from 'node:test';import assert from 'node:assert/strict';
import {applyOriginalChunkResults} from '../shared/original-chunk-result-applicator.mjs';
const live={identity:{},chunkRevision:3,groupVersions:new Map([['opaque',2]])};
const job=()=>({key:'0,0',identity:live.identity,chunkRevision:3,group:'opaque',version:2});
test('applies current jobs and rejects stale mesh versions and replaced chunk identities',()=>{
 const pending=[{...job(),version:1},{...job(),identity:{}},job()],seen=[];
 const r=applyOriginalChunkResults({pending,current:new Map([['0,0',live]]),apply:j=>seen.push(j),now:()=>0});
 assert.deepEqual([r.applied,r.stale,r.remaining],[1,2,0]);assert.equal(seen.length,1);
});
test('limits processed results per frame',()=>{
 const pending=[job(),job(),job()],seen=[];
 const r=applyOriginalChunkResults({pending,current:new Map([['0,0',live]]),apply:j=>seen.push(j),maxResults:2,now:()=>0});
 assert.equal(r.applied,2);assert.equal(r.remaining,1);
});
test('time budget prevents excess application',()=>{
 let clock=0;const pending=[job(),job()],r=applyOriginalChunkResults({pending,current:new Map([['0,0',live]]),apply:()=>{},now:()=>clock++,maxMilliseconds:2});
 assert.equal(r.applied,1);assert.equal(r.remaining,1);
});
