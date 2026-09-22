'use strict';
const assert = require('assert');
const { compareReferenceRuntime } = require('../lib/reference-fidelity');

function image(values) { return { width: 2, height: 2, pixels: Uint8Array.from(values) }; }
const reference = image([100,100,100,255, 150,150,150,255, 100,100,100,255, 150,150,150,255]);
const identical = image([100,100,100,255, 150,150,150,255, 100,100,100,255, 150,150,150,255]);
const degraded = image([100,100,100,255, 10,10,10,255, 100,100,100,255, 10,10,10,255]);

const perfect = compareReferenceRuntime(reference, identical, { heroMask: Uint8Array.from([0,1,0,1]) });
assert.deepStrictEqual([perfect.identityFidelity, perfect.heroDetailFidelity, perfect.structuralFidelity, perfect.score], [1,1,1,1]);
assert.strictEqual(perfect.method, 'cpu-rgba-color-edge-v1');

const worse = compareReferenceRuntime(reference, degraded, { heroMask: Uint8Array.from([0,1,0,1]) });
assert(worse.identityFidelity < 1);
assert(worse.heroDetailFidelity < worse.identityFidelity);
assert(worse.structuralFidelity < 1);
assert(worse.score < 1);
assert.throws(() => compareReferenceRuntime(reference, { width: 1, height: 1, pixels: new Uint8Array(4) }), /dimensions must match/);
console.log('reference-fidelity: PASS', JSON.stringify({ perfect, degraded: worse }));
