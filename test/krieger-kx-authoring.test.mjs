import test from'node:test';
import assert from'node:assert/strict';
import{compileCubeRecipeIntoKx,compilePrimitiveRecipeIntoKx,encodeKriegerCubeParams,encodeKriegerCylinderParams,encodeKriegerExtrudeParams,encodeKriegerSceneParams,writeKriegerF16,writeKriegerF24,writeKriegerX16}from'../tools/krieger-total-control/krieger-kx-authoring.mjs';

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


const compact=v=>v<=127?[v]:[(v&127)|128,v>>7];
const u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
const u16=v=>[v&255,(v>>>8)&255];

function nativeSceneFixture(){
  const classes=[
    {id:0xc1,conv:0x85000000,pack:''},
    {id:0x81,conv:0x0600000d,pack:'bbbbggggggfff'},
    {id:0xc0,conv:0x8000010a,pack:'ggggggfffb'},
  ],out=[];
  out.push(...u32(0),...u32(0),...u32(120*65536),...u32(32*65536));
  out.push(...compact(1),...compact(0));
  out.push(...compact(0),...Array.from({length:15},()=>compact(1)).flat());
  for(const c of classes)out.push(...u32(c.conv),...u16(c.id),...[...c.pack].map(x=>x.charCodeAt(0)),0);
  out.push(...u32(0));
  out.push(0,0);
  out.push(1,0);
  return Uint8Array.from(out);
}

test('cube recipe lowers into a multi-object native KX scene',()=>{
  const source=nativeSceneFixture();
  const out=compileCubeRecipeIntoKx(source,{objects:[
    {primitive:'cube',position:[0,0,0],scale:[1,1,1]},
    {primitive:'cube',position:[2,1,-3],scale:[2,.5,1]},
    {primitive:'cube',position:[-2,1,3],scale:[.5,2,.5]},
  ]});
  assert.equal(out.parsed.nOps,8);
  assert.equal(out.authored.length,3);
  assert.equal(out.parsed.roots[0],out.newRoot);
  assert.equal(out.parsed.ops[out.newRoot].operatorId,0xc1);
  assert.deepEqual(out.parsed.ops[out.newRoot].inputs,[0,...out.authored.map(x=>x.sceneIndex)]);
  assert.equal(out.parsed.trailingBytes,0);
});

test('binary cube subset fails closed instead of dropping unsupported gameplay',()=>{
  const source=nativeSceneFixture();
  assert.throws(()=>compileCubeRecipeIntoKx(source,{
    objects:[{primitive:'cube'}],
    weapons:[{id:'rifle'}],
  }),/does not lower weapons yet/);
  assert.throws(()=>compileCubeRecipeIntoKx(source,{
    objects:[{primitive:'cylinder'}],
  }),/supports cube only/);
});


test('cylinder and Extrude parameter encoders match pinned editor defaults',()=>{
  assert.deepEqual([...encodeKriegerCylinderParams()],[8,1,0,1,0]);
  const ex=encodeKriegerExtrudeParams();
  assert.equal(ex[0],1);
  assert.equal(new DataView(ex.buffer,ex.byteOffset,ex.byteLength).getInt16(1,true),0);
  assert.equal(ex[3],2);
  assert.equal(ex[4],1);
  assert.ok(ex.length>=14);
  assert.deepEqual([...writeKriegerX16(0)],[0,0]);
  assert.deepEqual([...writeKriegerX16(1)],[0,16]);
});

test('primitive binary subset fails closed if donor class table cannot represent requested primitive',()=>{
  const source=nativeSceneFixture();
  assert.throws(()=>compilePrimitiveRecipeIntoKx(source,{objects:[{primitive:'cylinder'}]}),/required native operator 0x82 absent/);
});
