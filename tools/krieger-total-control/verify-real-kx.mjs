
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {appendKriegerOperator,parseKriegerKx} from './krieger-kx.mjs';

const files=process.argv.slice(2);
if(!files.length){
  console.error('usage: node verify-real-kx.mjs <file.kx> [...]');
  process.exit(2);
}

const results=[];
for(const file of files){
  const source=new Uint8Array(fs.readFileSync(file));
  const before=parseKriegerKx(source);
  if(before.trailingBytes!==0) throw new Error(`${file}: parser left ${before.trailingBytes} trailing bytes`);
  const add=before.classes.find(c=>c.operatorId===0xc1);
  if(!add) throw new Error(`${file}: native Scene Add operator 0xc1 absent`);
  const root=before.roots.find(x=>x<before.nOps);
  if(root==null) throw new Error(`${file}: no live root to wrap`);
  const out=appendKriegerOperator(source,{
    operatorId:0xc1,
    inputs:[root],
    makeRootSlots:[0],
  });
  const after=out.parsed;
  if(after.nOps!==before.nOps+1) throw new Error(`${file}: operator count did not increase`);
  if(after.roots[0]!==before.nOps) throw new Error(`${file}: new root is not appended op`);
  if(after.ops.at(-1).inputs[0]!==root) throw new Error(`${file}: appended scene does not wrap prior root`);
  if(after.classes.length!==before.classes.length) throw new Error(`${file}: class table drift`);
  if(after.nSplines!==before.nSplines||after.eventCount!==before.eventCount) throw new Error(`${file}: unrelated timeline data drift`);
  if(after.trailingBytes!==0) throw new Error(`${file}: rewritten file has trailing parse residue`);
  results.push({
    file:path.basename(file),
    bytes:source.length,
    rewrittenBytes:out.bytes.length,
    oldLayout:before.oldLayout,
    opsBefore:before.nOps,
    opsAfter:after.nOps,
    classes:before.classes.length,
    splines:before.nSplines,
    events:before.eventCount,
    wrappedRoot:root,
    newRoot:after.roots[0],
    addClassIndex:add.index,
  });
}
console.log(JSON.stringify({pass:true,results},null,2));
