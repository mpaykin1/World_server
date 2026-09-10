'use strict';
const EPHEMERAL_NETLIFY=[
  /^deploy-preview-\d+--.+\.netlify\.app$/i,
  /^[a-f0-9]{20,}--.+\.netlify\.app$/i
];
function isEphemeralNetlifyHost(host){return EPHEMERAL_NETLIFY.some(re=>re.test(String(host||'')));}
function looksBrokenPage(text){return /\bsite not found\b|followed a broken link|entered a url that doesn.?t exist on netlify|\b404\s*(?:-|—)?\s*(?:page )?not found\b/i.test(String(text||''));}
function assertStableUserUrl(raw){
  const u=new URL(raw);
  if(u.protocol!=='https:')throw new Error(`Final user link must use HTTPS: ${u.href}`);
  if(isEphemeralNetlifyHost(u.hostname))throw new Error(`Ephemeral Netlify deploy cannot be a final user link: ${u.hostname}`);
  return u;
}
async function requestOk(raw){
  const u=assertStableUserUrl(raw);
  const r=await fetch(u,{redirect:'follow',cache:'no-store',headers:{'user-agent':'WorldServer-LinkVerifier/1.0'}});
  const text=await r.text();
  if(!r.ok)throw new Error(`HTTP ${r.status}: ${u.href}`);
  if(looksBrokenPage(text))throw new Error(`Broken-page signature: ${u.href}`);
  return {url:u.href,status:r.status,bytes:text.length};
}
async function verifyWorldServer(base){
  const origin=assertStableUserUrl(base).origin;
  const checked=[];
  checked.push(await requestOk(new URL('/apps/catalog/',origin).href));
  checked.push(await requestOk(new URL('/api/worlds',origin).href));
  const appsUrl=new URL('/api/apps?all=1',origin).href;
  const appsRes=await fetch(appsUrl,{cache:'no-store'});
  if(!appsRes.ok)throw new Error(`HTTP ${appsRes.status}: ${appsUrl}`);
  const data=await appsRes.json();
  for(const item of data.inventory||[]){
    if(!item?.worldMenu?.show||!['game','navigator','hub','experiment','experience'].includes(item.kind||'game'))continue;
    const target=item.external
      ? new URL(`/apps/world-gateway/?world=${encodeURIComponent(item.id)}`,origin).href
      : new URL(item.url,origin).href;
    checked.push(await requestOk(target));
  }
  return checked;
}
if(require.main===module){
  (async()=>{
    const args=process.argv.slice(2);
    const worlds=args[0]==='--worlds';
    const raw=worlds?args[1]:args[0];
    if(!raw)throw new Error('Usage: node scripts/verify-user-facing-link.js [--worlds] <https-url>');
    const result=worlds?await verifyWorldServer(raw):[await requestOk(raw)];
    console.log(JSON.stringify({pass:true,checked:result},null,2));
  })().catch(error=>{console.error('USER LINK VERIFY FAIL:',error.message);process.exit(1);});
}
module.exports={isEphemeralNetlifyHost,looksBrokenPage,assertStableUserUrl,requestOk,verifyWorldServer};
