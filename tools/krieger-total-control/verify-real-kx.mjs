import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {compileCubeRecipeIntoKx,parseKriegerKx} from './krieger-kx.mjs';

const files=process.argv.slice(2);
if(!files.length){
  console.error('usage: node verify-real-kx.mjs <file.kx> [...]');
  process.exit(2);
}

const recipe={
  id:'native-room-proof',
  objects:[
    {id:'floor',primitive:'cube',position:[0,-1,0],scale:[8,.5,8]},
    {id:'left-pillar',primitive:'cube',position:[-3,2,0],scale:[.7,3,.7]},
    {id:'right-pillar',primitive:'cube',position:[3,2,0],scale:[.7,3,.7]},
  ],
};
const results=[];
const writeDir=process.env.KK_WRITE_DIR||'';
if(writeDir)fs.mkdirSync(writeDir,{recursive:true});

for(const file of files){
  const source=new Uint8Array(fs.readFileSync(file));
  const before=parseKriegerKx(source);
  if(before.trailingBytes!==0)throw new Error(`${file}: parser left ${before.trailingBytes} trailing bytes`);
  const oldRoot=before.roots[0];
  if(oldRoot>=before.nOps)throw new Error(`${file}: root slot 0 is empty`);
  const out=compileCubeRecipeIntoKx(source,recipe);
  const after=out.parsed;
  if(writeDir)fs.writeFileSync(path.join(writeDir,path.basename(file)),out.bytes);
  if(after.nOps!==before.nOps+7)throw new Error(`${file}: expected 7 authored operators, got ${after.nOps-before.nOps}`);
  if(after.roots[0]!==out.newRoot)throw new Error(`${file}: root does not point at authored Scene Add`);
  const authoredTypes=out.authored.flatMap(x=>[after.ops[x.cubeIndex].operatorId,after.ops[x.sceneIndex].operatorId]);
  if(authoredTypes.some((id,i)=>id!==(i%2===0?0x81:0xc0)))throw new Error(`${file}: Cube/Scene authoring chain mismatch`);
  const add=after.ops[out.newRoot];
  if(add.operatorId!==0xc1)throw new Error(`${file}: final root is not Scene Add`);
  const expectedInputs=[oldRoot,...out.authored.map(x=>x.sceneIndex)];
  if(JSON.stringify(add.inputs)!==JSON.stringify(expectedInputs))throw new Error(`${file}: final Add inputs mismatch`);
  if(after.classes.length!==before.classes.length)throw new Error(`${file}: class table drift`);
  if(after.nSplines!==before.nSplines||after.eventCount!==before.eventCount)throw new Error(`${file}: unrelated timeline data drift`);
  if(after.trailingBytes!==0)throw new Error(`${file}: rewritten file has trailing parse residue`);
  results.push({
    file:path.basename(file),bytes:source.length,rewrittenBytes:out.bytes.length,
    oldLayout:before.oldLayout,opsBefore:before.nOps,opsAfter:after.nOps,
    authoredObjects:out.authored.length,authoredOperators:7,
    authoredChain:'3x(Cube 0x81 -> Scene 0xc0) -> Add 0xc1',
    classes:before.classes.length,splines:before.nSplines,events:before.eventCount,
    wrappedRoot:oldRoot,newRoot:after.roots[0],
  });
}
console.log(JSON.stringify({pass:true,recipe,results},null,2));
