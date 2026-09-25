'use strict';
// Read exact Git diff without ever buffering large binary assets in a CI runner.
const cp=require('node:child_process');
const SHA=/^[a-f0-9]{40}$/i;
const MAX_PATCH_BYTES=96000;
class PatchReadError extends Error {
 constructor(message){super(message);this.name='PatchReadError';}
}
function readPatch(base,head,{run=cp.execFileSync,cwd}={}){
 if(!SHA.test(base)||!SHA.test(head))
  throw new PatchReadError('Expected exact 40-character commit SHAs');
 const scope=base+'...'+head;
 const opts={encoding:'utf8',cwd,maxBuffer:512*1024};
 let stats;
 try{
  // --no-renames makes every changed path independently visible.
  stats=run('git',['diff','--numstat','-z','--no-renames',scope,'--'],opts);
 }catch{
  throw new PatchReadError('Could not enumerate complete exact-head diff; review inconclusive');
 }
 if(!stats)throw new PatchReadError('No changes to independently review');
 const binary=stats.split('\0').filter(item=>/^-[\t]-[\t]/.test(item));
 if(binary.length){
  throw new PatchReadError('Binary change requires separate asset/human review ('+
   binary.length+' binary file(s)); no patch content omitted or approved');
 }
 try{
  const patch=run('git',['diff','--no-ext-diff','--no-color','--binary',
   '--no-renames','--unified=8',scope,'--'],
   {encoding:'utf8',cwd,maxBuffer:MAX_PATCH_BYTES*2});
  if(Buffer.byteLength(patch)>MAX_PATCH_BYTES)
   throw new PatchReadError('Patch exceeds review budget; full human review required');
  return patch;
 }catch(err){
  if(err instanceof PatchReadError)throw err;
  if(err.code==='ENOBUFS'||err.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
   throw new PatchReadError('Patch exceeds review budget; full human review required');
  throw new PatchReadError('Could not retrieve complete exact-head diff; review inconclusive');
 }
}
module.exports={readPatch,PatchReadError,MAX_PATCH_BYTES};
