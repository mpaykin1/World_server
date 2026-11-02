#!/usr/bin/env node
'use strict';
// Delete ONLY preview Workers whose associated GitHub PR is confirmed closed.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const githubToken=process.env.GITHUB_TOKEN;
const repository=process.env.GITHUB_REPOSITORY||'mpaykin1/World_server';
const closedPR=process.env.CLOSED_PR_NUMBER||'';
if(!account||!token||!githubToken) {
  console.error('Missing Cloudflare or GitHub credentials');process.exit(1);
}
async function cf(path,method='GET') {
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+path,{
    method,headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok||body.success===false){
    throw new Error('Cloudflare '+method+' '+path+': HTTP '+response.status+' '+JSON.stringify(body.errors||[]));
  }
  return body;
}
async function confirmedClosed(pr) {
  const response=await fetch('https://api.github.com/repos/'+repository+'/pulls/'+pr,{
    headers:{Authorization:'Bearer '+githubToken,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
  });
  if(!response.ok)throw new Error('GitHub PR #'+pr+' status: '+response.status);
  return (await response.json()).state==='closed';
}
async function previewNames() {
  if(closedPR&&!/^\d+$/.test(closedPR))throw new TypeError('Invalid CLOSED_PR_NUMBER');
  // A PR may close before its preview ever deploys (e.g. Cloudflare error 10037).
  // Do not fail the cleanup when that Worker does not exist.
  const result=await cf('/workers/scripts');
  if(!Array.isArray(result.result))throw new TypeError('Unexpected Cloudflare scripts response');
  const previews=[...new Set(result.result.map(x=>x.id).filter(x=>
    typeof x==='string'&&/^world-server-pr-\d+$/.test(x)))];
  return closedPR?previews.filter(name=>name==='world-server-pr-'+closedPR):previews;
}
(async()=>{
  const names=await previewNames();
  let removed=0,kept=0;
  for(const name of names) {
    if(!/^world-server-pr-\d+$/.test(name))throw new Error('Refusing non-preview Worker');
    const pr=Number(name.replace('world-server-pr-',''));
    if(!await confirmedClosed(pr)) {kept++;continue; }
    await cf('/workers/scripts/'+encodeURIComponent(name),'DELETE');
    removed++;
    console.log('Removed closed PR #'+pr+' preview: '+name);
  }
  console.log('Cleanup: removed='+removed+' kept_open='+kept+' matched='+names.length);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
