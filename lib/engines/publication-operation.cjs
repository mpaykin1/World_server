'use strict';
const {validateGameArtifact}=require('./game-validation.cjs');
const {verifyPublicDelivery}=require('./publication-delivery.cjs');
// Backend and acceptance authority are host dependencies, never RPC arguments.
// No backend is configured by default and this module never merges a PR.
function createPublicationOperation({sourceCommit,readArtifact,backend,verifyDelivery=verifyPublicDelivery}={}) {
 if(!/^[a-f0-9]{40}$/.test(sourceCommit)||typeof readArtifact!=='function'||
   !backend||['approveArtifact','ensureCandidate','inspectCandidate'].some(k=>typeof backend[k]!=='function'))
   throw new TypeError('Trusted publication backend required');
 const active=new Map();
 async function execute(id){
  const artifact=structuredClone(readArtifact(id));
  if(!validateGameArtifact(artifact,{sourceCommit}).integrity||artifact.manifest_sha256!==id)
   throw Error('Invalid publication package');
  const game=artifact.manifest.game_id;
  if(!/^generated-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game)||game.length>80)
   throw Error('Only new generated game routes accepted');
  const accepted=await backend.approveArtifact(structuredClone(artifact));
  if(accepted?.manifest_sha256!==id||accepted.source_commit!==sourceCommit||
    accepted.browser!=='passed'||accepted.rights!=='approved'||
    typeof accepted.approval_id!=='string'||!accepted.approval_id||accepted.approval_id.length>160)
   throw Error('Trusted artifact acceptance required');
  const descriptor={operation_id:id,repository:'mpaykin1/meta6',base:'main',
    directory:'meta-games-worlds/'+game+'/',create_only:true,
    package:structuredClone(artifact)};
  const candidate=await backend.ensureCandidate(descriptor);
  const matches=c=>c?.repository==='mpaykin1/meta6'&&c.base==='main'&&
   c.manifest_sha256===id&&Number.isSafeInteger(c.number)&&c.number>0&&
   c.url==='https://github.com/mpaykin1/meta6/pull/'+c.number;
  if(!matches(candidate))throw Error('Publication candidate mismatch');
  const status=await backend.inspectCandidate(candidate.number);
  if(!matches(status)||status.number!==candidate.number)throw Error('Publication status mismatch');
  const result={operation_id:id,manifest_sha256:id,source_commit:sourceCommit,
    candidate_url:candidate.url,publication:'not_published',state:'pending_review'};
  if(status.closed&&!status.merged)return {...result,state:'closed_without_release'};
  if(!status.merged)return result;
  if(!/^[a-f0-9]{40}$/.test(status.merge_commit||'')||status.release_checks!=='passed'||
    status.acceptance_commit!==status.merge_commit||status.owner_acceptance!=='approved')
   return {...result,state:'pending_release_acceptance'};
  const delivery=await verifyDelivery(artifact);
  const expected='https://mpaykin1.github.io/meta6/meta-games-worlds/'+game+'/';
  if(delivery?.delivery!=='verified'||delivery.manifest_sha256!==id||
    delivery.source_commit!==sourceCommit||delivery.url!==expected)
   return {...result,state:'pending_public_delivery'};
  return {...result,state:'published',publication:'published',url:expected,
    merge_commit:status.merge_commit,approval_id:accepted.approval_id,
    browser:'passed',rights:'approved',delivery:structuredClone(delivery)};
 }
 return input=>{
  if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).length!==1||
    !/^[a-f0-9]{64}$/.test(input.artifact_id))return Promise.reject(Error('Only artifact_id accepted'));
  const id=input.artifact_id;
  if(active.has(id))return active.get(id);
  if(active.size>=4)return Promise.reject(Error('Publication operation budget'));
  const pending=execute(id).finally(()=>active.delete(id));active.set(id,pending);return pending;
 };
}
module.exports={createPublicationOperation};
