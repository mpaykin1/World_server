import test from'node:test';
import assert from'node:assert/strict';
import{encodeKriegerCubeParams,encodeKriegerSceneParams,writeKriegerF16,writeKriegerF24}from'../tools/krieger-total-control/krieger-kx-authoring.mjs';

test('Krieger compact float writers preserve canonical one-byte constants',()=>{
  assert.deepEqual([...writeKriegerF16(0)],[0]);
  assert.deepEqual([...writeKriegerF16(1)],[0x80]);
  assert.deepEqual([...writeKriegerF16(.5)],[1]);
  assert.deepEqual([...writeKriegerF16(.25)],[0x81]);
  assert.deepEqual([...writeKriegerF24(0)],[0]);
  assert.deepEqual([...writeKriegerF24(1)],[1]);
  assert.deepEqual([...writeKriegerF24(-1)],[0xff]);
});

test('native Cube defaults match the pinned Werkkzeug editor defaults',()=>{
  assert.deepEqual([...encodeKriegerCubeParams()],[1,1,1,0,0x80,0x80,0x80,0,0,0,0,0,0]);
});

test('native Scene defaults encode scale one and zero rotate/translate',()=>{
  assert.deepEqual([...encodeKriegerSceneParams()],[0x80,0x80,0x80,0,0,0,0,0,0,0]);
});

test('nontrivial finite transforms use variable compact encodings',()=>{
  const cube=encodeKriegerCubeParams({scale:[2,.75,.125],rotation:[.1,.2,.3],translation:[3,-2.5,9]});
  const scene=encodeKriegerSceneParams({translation:[3,-2.5,9]});
  assert.ok(cube.length>13);
  assert.ok(scene.length>10);
});
