import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {compilePrimitiveRecipeIntoKx,parseKriegerKx} from './krieger-kx.mjs';

const files=process.argv.slice(2);
if(!files.length){console.error('usage: node verify-real-kx.mjs <file.kx> [...]');process.exit(2);}

const recipe={
  id:'native-room-proof',
  objects:[
    {id:'floor',primitive:'cube',position:[0,-1,0],scale:[8,.5,8]},
    {id:'column',primitive:'cylinder',position:[-3,2,0],scale:[.8,3,.8],params:{facets:12,rings:2}},
    {id:'extruded-block',primitive:'cube',position:[3,2,0],scale:[1,1.5,1],modifiers:[{kind:'extrude',params:{count:2,distance:[0,.2,0],scale:[1,.9,1]}}]},
  ],
};
const results=[],writeDir=process.env.KK_WRITE_DIR||'';
if(writeDir)fs.mkdirSync(writeDir,{recursive:true});

for(const file of files){
  const source=new Uint8Array(fs.readFileSync(file)),before=parseKriegerKx(source);
  if(before.trailingBytes!==0)throw new Error(`${file}: parser left ${before.trailingBytes} trailing bytes`);
  const oldRoot=before.roots[0];if(oldRoot>=before.nOps)throw new Error(`${file}: root slot 0 is empty`);
  const out=compilePrimitiveRecipeIntoKx(source,recipe),after=out.parsed;
  if(writeDir)fs.writeFileSync(path.join(writeDir,path.basename(file)),out.bytes);
  if(after.nOps!==before.nOps+8)throw new Error(`${file}: expected 8 authored operators, got ${after.nOps-before.nOps}`);
  if(after.roots[0]!==out.newRoot)throw new Error(`${file}: root does not point at authored Scene Add`);
  const opIds=out.authored.map(x=>({
    primitive:after.ops[x.primitiveIndex].operatorId,
    modifiers:x.modifierIndices.map(i=>after.ops[i].operatorId),
    scene:after.ops[x.sceneIndex].operatorId,
  }));
  if(opIds[0].primitive!==0x81||opIds[1].primitive!==0x82||opIds[2].primitive!==0x81)throw new Error(`${file}: primitive lowering mismatch`);
  if(JSON.stringify(opIds[2].modifiers)!==JSON.stringify([0x9a]))throw new Error(`${file}: native Extrude lowering mismatch`);
  if(opIds.some(x=>x.scene!==0xc0))throw new Error(`${file}: Scene lowering mismatch`);
  const add=after.ops[out.newRoot],expected=[oldRoot,...out.authored.map(x=>x.sceneIndex)];
  if(add.operatorId!==0xc1||JSON.stringify(add.inputs)!==JSON.stringify(expected))throw new Error(`${file}: final Scene Add mismatch`);
  if(after.classes.length!==before.classes.length)throw new Error(`${file}: class table drift`);
  if(after.nSplines!==before.nSplines||after.eventCount!==before.eventCount)throw new Error(`${file}: unrelated timeline data drift`);
  if(after.trailingBytes!==0)throw new Error(`${file}: rewritten file has trailing parse residue`);
  results.push({file:path.basename(file),bytes:source.length,rewrittenBytes:out.bytes.length,oldLayout:before.oldLayout,
    opsBefore:before.nOps,opsAfter:after.nOps,authoredObjects:3,authoredOperators:8,
    authoredChain:'Cube + Cylinder + (Cube->Extrude) -> Scene x3 -> Add',
    classes:before.classes.length,splines:before.nSplines,events:before.eventCount,wrappedRoot:oldRoot,newRoot:after.roots[0]});
}
console.log(JSON.stringify({pass:true,recipe,results},null,2));
