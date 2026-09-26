import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeSparseEdits,decodeSparseEdits} from '../shared/original-sparse-chunk-edits.mjs';
test('sparse edits survive block id reorder',()=>{
 const record=encodeSparseEdits([16,16,16],new Map([[5,1],[2,0]]),['stone','wood']);
 assert.deepEqual([...decodeSparseEdits(record,['wood','stone'])],[[2,1],[5,0]]);
});
test('rejects missing names and duplicate indices',()=>{
 const record=encodeSparseEdits([2,2,2],new Map([[0,0]]),['stone']);
 assert.throws(()=>decodeSparseEdits(record,['wood']));
 record.entries.push([0,'stone']);
 assert.throws(()=>decodeSparseEdits(record,['stone']));
});
