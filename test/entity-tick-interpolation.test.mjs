import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntityInterpolator} from '../shared/entity-tick-interpolation.mjs';

test('interpolates server ticks without affecting simulation',()=>{
 const q=createEntityInterpolator({tickMs:50});
 q.ingest({id:'mob',position:{x:0,y:0,z:0},heading:0,timestamp:100});
 q.ingest({id:'mob',position:{x:10,y:0,z:0},heading:Math.PI/2,timestamp:150});
 assert.equal(q.sample('mob',175).position.x,5);
 assert.ok(Math.abs(q.sample('mob',175).heading-Math.PI/4)<1e-9);
 assert.equal(q.sample('mob',250).position.x,10);
 assert.equal(q.sample('missing',250),null);
});
test('drops out-of-order ticks, snaps teleports, respects cap',()=>{
 const q=createEntityInterpolator({maxEntities:1});
 q.ingest({id:'a',position:{x:1,y:0,z:0},timestamp:100});
 assert.equal(q.ingest({id:'a',position:{x:999,y:0,z:0},timestamp:99}),false);
 assert.equal(q.ingest({id:'b',position:{x:0,y:0,z:0},timestamp:100}),false);
 q.ingest({id:'a',position:{x:100,y:0,z:0},timestamp:150,teleport:true});
 assert.equal(q.sample('a',150).position.x,100);
 assert.equal(q.remove('a'),true);
 assert.equal(q.size,0);
});
test('heading wraps along shortest arc',()=>{
 const q=createEntityInterpolator();
 q.ingest({id:'a',position:{x:0,y:0,z:0},heading:Math.PI-.1,timestamp:0});
 q.ingest({id:'a',position:{x:0,y:0,z:0},heading:-Math.PI+.1,timestamp:50});
 assert.ok(Math.abs(q.sample('a',75).heading-Math.PI)<1e-8);
});
