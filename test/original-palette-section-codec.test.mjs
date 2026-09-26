import test from 'node:test';import assert from 'node:assert/strict';
import {encodeOriginalPaletteSection,decodeOriginalPaletteSection} from '../shared/original-palette-section-codec.mjs';
test('homogeneous section encodes to one palette entry and one run',()=>{
 const original=new Uint16Array(4096).fill(123);
 const encoded=encodeOriginalPaletteSection(original);
 assert.deepEqual(encoded.palette,[123]);assert.deepEqual(encoded.runs,[4096,0]);
 assert.deepEqual(decodeOriginalPaletteSection(encoded),original);
});
test('roundtrips deterministic mixed and alternating voxel patterns',()=>{
 let seed=123456789;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 for(let t=0;t<60;t++){
  const a=new Uint16Array(4096);
  for(let i=0;i<a.length;i++)a[i]=t%2?random()%65536:(Math.floor(i/(1+t%31))%8);
  assert.deepEqual(decodeOriginalPaletteSection(encodeOriginalPaletteSection(a)),a,`pattern ${t}`);
 }
});
test('rejects truncated, overflowing and invalid palette references',()=>{
 const base=encodeOriginalPaletteSection(new Uint16Array(10).fill(7));
 assert.throws(()=>decodeOriginalPaletteSection({...base,runs:[11,0]}),RangeError);
 assert.throws(()=>decodeOriginalPaletteSection({...base,runs:[9,0]}),RangeError);
 assert.throws(()=>decodeOriginalPaletteSection({...base,runs:[10,1]}),RangeError);
});
