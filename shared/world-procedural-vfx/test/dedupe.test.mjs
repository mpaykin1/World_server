import test from 'node:test';import assert from 'node:assert/strict';import {TtlEventDedupe} from '../runtime/dedupe.mjs';
test('dedupe blocks retry then expires',()=>{let now=0;const d=new TtlEventDedupe({ttlMs:100,max:3,now:()=>now});assert.equal(d.seen('a'),false);assert.equal(d.seen('a'),true);now=101;assert.equal(d.seen('a'),false);});
