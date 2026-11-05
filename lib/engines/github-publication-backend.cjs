'use strict';
const {createHash}=require('node:crypto');
const {validateGameArtifact}=require('./game-validation.cjs');
const repo='mpaykin1/meta6',root='/repos/'+repo;
const names=['data/pipeline.json','data/provenance.json','game.js','index.html',
 'shaders/atmosphere-fragment.glsl','shaders/atmosphere-vertex.glsl'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const blob=text=>{const b=Buffer.from(text,'utf8');return createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');};
// request({method,path,body}) returns {status,data}. Authentication/transport and
// acceptance authorities are trusted host dependencies, never RPC parameters.
function createGithubPublicationBackend({request,approveArtifact,acceptRelease}={}){
 if([request,approveArtifact,acceptRelease].some(x=>typeof x!=='function'))
  throw TypeError('Trusted GitHub transport and acceptance authorities required');
 const contexts=new Map();
 async function api(method,path,body){
  const r=await request({method,path:root+path,...(body?{body}:{})});
  if(![200,201].includes(r?.status)){const e=Error('GitHub operation rejected');e.status=r?.status;throw e;}
  return r.data;
 }
 async function maybe(path){try{return await api('GET',path);}catch(e){if(e.status===404)return null;throw e;}}
 function packageContext(d){
  if(!d||Object.keys(d).sort().join(',')!=='base,create_only,directory,operation_id,package,repository'||
   d.repository!==repo||d.base!=='main'||d.create_only!==true||
   !validateGameArtifact(d.package).integrity||d.operation_id!==d.package.manifest_sha256)
   throw Error('Invalid publication descriptor');
  const a=structuredClone(d.package),id=a.manifest_sha256,game=a.manifest.game_id;
  if(!/^generated-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game)||game.length>80||
   d.directory!=='meta-games-worlds/'+game+'/'||Object.keys(a.files).sort().join(',')!==names.join(','))
   throw Error('Unsupported publication package');
  const files={...a.files,'manifest.json':JSON.stringify({...a.manifest,manifest_sha256:id},null,2)+'\n'};
  const entries=Object.entries(files).map(([name,content])=>({path:d.directory+name,content,mode:'100644',type:'blob',sha:blob(content)}));
  if(entries.some(e=>Buffer.byteLength(e.content)>1048576)||entries.reduce((n,e)=>n+Buffer.byteLength(e.content),0)>2097152)
   throw Error('Publication package budget');
  return {id,game,entries,directory:d.directory,branch:'ai/meta-games/publish-'+id};
 }
 const receipt=(c,pr)=>({repository:repo,base:'main',manifest_sha256:c.id,number:pr.number,url:pr.html_url});
 function validatePr(c,pr){
  if(!Number.isSafeInteger(pr?.number)||pr.number<1||pr.html_url!=='https://github.com/'+repo+'/pull/'+pr.number||
   pr.base?.repo?.full_name!==repo||pr.base.ref!=='main'||pr.head?.repo?.full_name!==repo||
   pr.head.ref!==c.branch||!sha(pr.head.sha))throw Error('Publication PR mismatch');
 }
 async function findPr(c){
  const found=await api('GET','/pulls?state=all&head='+encodeURIComponent('mpaykin1:'+c.branch)+'&base=main&per_page=2');
  if(!Array.isArray(found)||found.length>1)throw Error('Ambiguous publication PR');
  if(!found.length)return null;
  if(!Number.isSafeInteger(found[0]?.number)||found[0].number<1)throw Error('Invalid publication PR number');
  const pr=await api('GET','/pulls/'+found[0].number);validatePr(c,pr);return pr;
 }
 async function absentAt(c,commit){
  const existing=await maybe('/contents/'+c.directory.slice(0,-1)+'?ref='+commit);
  if(existing!==null)throw Error('Publication route already exists');
 }
 async function verifyCommit(c,head){
  if(!sha(head))throw Error('Invalid publication head');
  const commit=await api('GET','/git/commits/'+head);
  if(commit.sha!==head||commit.parents?.length!==1||!sha(commit.parents[0].sha))throw Error('Publication commit mismatch');
  const parent=commit.parents[0].sha;
  if(!sha(commit.tree?.sha))throw Error('Invalid candidate tree');
  let treeSha=commit.tree.sha;
  for(const segment of ['meta-games-worlds',c.game]){
   const tree=await api('GET','/git/trees/'+treeSha);
   const entry=tree.tree?.find(e=>e.path===segment);
   if(tree.truncated||entry?.type!=='tree'||entry.mode!=='040000'||!sha(entry.sha))
    throw Error('Invalid publication directory tree');
   treeSha=entry.sha;
  }
  const files=await api('GET','/git/trees/'+treeSha+'?recursive=1');
  if(files.truncated||!Array.isArray(files.tree)||
   c.entries.some(e=>!files.tree.some(f=>c.directory+f.path===e.path&&f.type==='blob'&&f.mode==='100644'&&f.sha===e.sha)))
   throw Error('Publication file mode or bytes mismatch');
  await absentAt(c,parent);
  const diff=await api('GET','/compare/'+parent+'...'+head);
  if(diff.total_commits!==1||diff.files?.length!==c.entries.length||diff.commits?.[0]?.sha!==head||
   c.entries.some(e=>!diff.files.some(f=>f.filename===e.path&&f.status==='added'&&f.sha===e.sha))||
   new Set(diff.files.map(f=>f.filename)).size!==c.entries.length)
   throw Error('Publication candidate bytes mismatch');
 }
 async function ensureCandidate(d){
  const c=packageContext(d);
  let pr=await findPr(c);
  if(!pr){
   let ref=await maybe('/git/ref/heads/'+c.branch);
   if(!ref){
    const main=await api('GET','/git/ref/heads/main');
    if(!sha(main.object?.sha))throw Error('Invalid publication base');
    await absentAt(c,main.object.sha);
    const base=await api('GET','/git/commits/'+main.object.sha);
    if(!sha(base.tree?.sha))throw Error('Invalid base tree');
    const tree=await api('POST','/git/trees',{base_tree:base.tree.sha,
     tree:c.entries.map(({sha:unused,...e})=>e)});
    if(!sha(tree.sha))throw Error('Invalid publication tree');
    const commit=await api('POST','/git/commits',{message:'META GAMES publication '+c.id,tree:tree.sha,parents:[main.object.sha]});
    if(!sha(commit.sha))throw Error('Invalid publication commit');
    try{await api('POST','/git/refs',{ref:'refs/heads/'+c.branch,sha:commit.sha});}
    catch{/* Conflict/uncertain response: read the one canonical ref below. */}
    ref=await maybe('/git/ref/heads/'+c.branch);
    if(!ref)throw Error('Publication ref unavailable');
   }
   await verifyCommit(c,ref.object?.sha);
   const latest=await api('GET','/git/ref/heads/main');
   if(!sha(latest.object?.sha))throw Error('Invalid publication base');
   await absentAt(c,latest.object.sha);
   try{pr=await api('POST','/pulls',{title:'Publish '+c.game,head:c.branch,base:'main',
    body:'Generated package '+c.id+'. Candidate only; release requires exact-commit acceptance and public byte verification.'});}
   catch{pr=await findPr(c);if(!pr)throw Error('Publication PR unavailable');}
  }
  validatePr(c,pr);await verifyCommit(c,pr.head.sha);
  if(contexts.size>=4&&!contexts.has(pr.number))contexts.delete(contexts.keys().next().value);
  contexts.set(pr.number,{...c,head:pr.head.sha});
  return receipt(c,pr);
 }
 async function inspectCandidate(number){
  const c=contexts.get(number);if(!c)throw Error('Publication candidate unavailable');
  const pr=await api('GET','/pulls/'+number);validatePr(c,pr);
  if(pr.head.sha!==c.head||typeof pr.merged!=='boolean'||!['open','closed'].includes(pr.state))
   throw Error('Publication PR changed');
  const result={...receipt(c,pr),merged:pr.merged,closed:pr.state==='closed'};
  if(!pr.merged)return result;
  if(!sha(pr.merge_commit_sha))throw Error('Invalid merged publication commit');
  // Host must independently verify required release checks and owner acceptance.
  const accepted=await acceptRelease({repository:repo,number,manifest_sha256:c.id,merge_commit:pr.merge_commit_sha});
  return {...result,merge_commit:pr.merge_commit_sha,
   release_checks:accepted?.release_checks,owner_acceptance:accepted?.owner_acceptance,
   acceptance_commit:accepted?.acceptance_commit};
 }
 return Object.freeze({approveArtifact,ensureCandidate,inspectCandidate});
}
module.exports={createGithubPublicationBackend};
