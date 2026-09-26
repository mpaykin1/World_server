import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeOriginalChunk,decodeOriginalChunk} from '../shared/original-chunk-save-codec.mjs';
test('versioned chunk codec preserves dimensions, origin and every block',()=>{
 const source={size:[2,2,2],origin:[-16,0,32],blocks:Uint16Array.from([0,1,255,256,65535,3,4,5])};
 const bytes=encodeOriginalChunk(source),decoded=decodeOriginalChunk(bytes);
 assert.equal(bytes.length,40);
 assert.deepEqual(decoded.size,source.size);
 assert.deepEqual(decoded.origin,source.origin);
 assert.deepEqual(decoded.blocks,source.blocks);
 assert.equal(decoded.version,1);
});
test('rejects corrupted header, truncation and unbounded allocation',()=>{
 const bytes=encodeOriginalChunk({size:[1,1,1],blocks:new Uint16Array([3])});
 const corrupt=bytes.slice();corrupt[4]=2;
 assert.throws(()=>decodeOriginalChunk(corrupt),/version/);
 assert.throws(()=>decodeOriginalChunk(bytes.slice(0,-1)),/length/);
 assert.throws(()=>encodeOriginalChunk({size:[100,100,100],blocks:new Uint16Array(1)}),RangeError);
});
