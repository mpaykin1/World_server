
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {appendNativeCubeScene,parseKriegerKx} from './krieger-kx.mjs';

const files=process.argv.slice(2);
if(!files.length){
  console.error('usage: node verify-real-kx.mjs <file.kx> [...]');
  process.exit(2);
}

const results=[];
const writeDir=process.env.KK_WRITE_DIR||'';
if(writeDir)fs.mkdirSync(writeDir,{recursive:true});
for(const file of files){
  const source=new Uint8Array(fs.readFileSync(file));
  const before=parseKriegerKx(source);
  if(before.trailingBytes!==0) throw new Error(`${file}: parser left ${before.trailingBytes} trailing bytes`);
  const oldRoot=before.roots[0];
  if(oldRoot>=before.nOps) throw new Error(`${file}: root slot 0 is empty`);
  const out=appendNativeCubeScene(source,{scene:{translation:[3,1,-4]}});
  const after=out.parsed;
  if(writeDir)fs.writeFileSync(path.join(writeDir,path.basename(file)),out.bytes);
  if(after.nOps!==before.nOps+3) throw new Error(`${file}: expected three authored operators`);
  if(after.roots[0]!==out.addIndex) throw new Error(`${file}: root does not point at native Scene Add`);
  const cube=after.ops[out.cubeIndex],scene=after.ops[out.sceneIndex],add=after.ops[out.addIndex];
  if(cube.operatorId!==0x81||scene.operatorId!==0xc0||add.operatorId!==0xc1) throw new Error(`${file}: native Cube->Scene->Add chain mismatch`);
  if(scene.inputs[0]!==out.cubeIndex) throw new Error(`${file}: Scene does not own authored Cube`);
  if(add.inputs[0]!==oldRoot||add.inputs[1]!==out.sceneIndex) throw new Error(`${file}: Add does not preserve old root plus authored scene`);
  if(after.classes.length!==before.classes.length) throw new Error(`${file}: class table drift`);
  if(after.nSplines!==before.nSplines||after.eventCount!==before.eventCount) throw new Error(`${file}: unrelated timeline data drift`);
  if(after.trailingBytes!==0) throw new Error(`${file}: rewritten file has trailing parse residue`);
  results.push({
    file:path.basename(file),bytes:source.length,rewrittenBytes:out.bytes.length,
    oldLayout:before.oldLayout,opsBefore:before.nOps,opsAfter:after.nOps,
    authoredChain:['0x81','0xc0','0xc1'],classes:before.classes.length,
    splines:before.nSplines,events:before.eventCount,wrappedRoot:oldRoot,
    newRoot:after.roots[0],cubeIndex:out.cubeIndex,sceneIndex:out.sceneIndex,addIndex:out.addIndex,
  });
}
console.log(JSON.stringify({pass:true,results},null,2));
