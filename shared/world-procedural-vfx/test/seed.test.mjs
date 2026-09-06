import test from 'node:test'; import assert from 'node:assert/strict'; import {mulberry32,hashString32} from '../runtime/seed.mjs';
test('seeded PRNG deterministic',()=>{const a=mulberry32(123),b=mulberry32(123); assert.deepEqual([a(),a(),a()],[b(),b(),b()]);});
test('hash stable',()=>assert.equal(hashString32('world'),hashString32('world')));
