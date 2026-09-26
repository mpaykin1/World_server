/** Original sparse chunk edits with stable block names. */
export function encodeSparseEdits(size, edits, names) {
 if (!Array.isArray(size) || size.length !== 3 || size.some(n => !Number.isInteger(n) || n < 1 || n > 256)) throw new RangeError('size');
 const volume = size.reduce((a,b)=>a*b,1);
 if (volume > 262144 || !(edits instanceof Map) || !Array.isArray(names)) throw new TypeError('inputs');
 const entries = [...edits].sort((a,b)=>a[0]-b[0]).map(([index,id])=>{
  if (!Number.isInteger(index) || index < 0 || index >= volume || !Number.isInteger(id) || typeof names[id] !== 'string') throw new RangeError('edit');
  return [index,names[id]];
 });
 return {version:1,size:[...size],entries};
}
export function decodeSparseEdits(record,names) {
 if (record?.version !== 1 || !Array.isArray(record.size) || !Array.isArray(record.entries) || !Array.isArray(names)) throw new TypeError('record');
 const volume=record.size.reduce((a,b)=>a*b,1),changes=new Map();
 if (volume < 1 || volume > 262144 || record.entries.length > volume) throw new RangeError('volume');
 for (const [index,name] of record.entries) {
  const id=names.indexOf(name);
  if (!Number.isInteger(index) || index < 0 || index >= volume || changes.has(index) || id < 0) throw new Error('invalid edit or unknown block');
  changes.set(index,id);
 }
 return changes;
}
