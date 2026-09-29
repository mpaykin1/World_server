'use strict';
// Read PR asset blobs with two bounded git calls; no untrusted checkout/scripts.
function readBlobs(head,paths,run){
  const tree=run(['ls-tree','-r','--full-tree',head,'--',
    'apps/voxel-world/voxel-art/']);
  const entries=new Map();
  for(const line of tree.trim().split(/\r?\n/).filter(Boolean)){
    const match=/^\d+ blob ([a-f0-9]{40})\t(.+)$/.exec(line);
    if(match)entries.set(match[2],match[1]);
  }
  for(const name of paths)if(!entries.has(name))throw Error('Missing PR asset: '+name);
  const request=paths.map(name=>entries.get(name)).join('\n')+'\n';
  const bytes=run(['cat-file','--batch'],{binary:true,input:request});
  const result=new Map();let offset=0;
  for(const name of paths){
    const end=bytes.indexOf(10,offset);
    if(end<0)throw Error('Incomplete git batch header');
    const header=bytes.subarray(offset,end).toString('ascii');
    const match=/^([a-f0-9]{40}) blob (\d+)$/.exec(header);
    if(!match||match[1]!==entries.get(name))throw Error('Unexpected git blob');
    const length=Number(match[2]);
    if(!Number.isSafeInteger(length)||length<1||length>5_000_000)
      throw Error('Git blob exceeds per-file budget: '+name);
    offset=end+1;
    if(offset+length>=bytes.length)throw Error('Truncated git blob: '+name);
    result.set(name,bytes.subarray(offset,offset+length));
    offset+=length+1;
  }
  if(offset!==bytes.length)throw Error('Unexpected trailing git blob data');
  return result;
}
module.exports={readBlobs};
