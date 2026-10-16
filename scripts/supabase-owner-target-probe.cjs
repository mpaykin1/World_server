'use strict';
const REF='xlcdnlsyvxqtopmkweiy';
function config(env=process.env){
 const url=String(env.SUPABASE_URL||'').replace(/\/+$/,'');
 const key=String(env.SUPABASE_SECRET_KEY||'').trim();
 if(!url||!key)throw Error('Missing target configuration');
 const p=new URL(url);
 if(p.hostname!==REF+'.supabase.co'||p.protocol!=='https:'||p.pathname!=='/')throw Error('Unexpected project');
 if(!key.startsWith('sb_secret_'))throw Error('Expected sb_secret format');
 return {url,key};
}
async function probe(env=process.env,request=globalThis.fetch){
 const {url,key}=config(env);
 const response=await request(url+'/rest/v1/',{method:'GET',headers:{apikey:key,Accept:'application/openapi+json'}});
 if(!response.ok)return {ok:false,status:response.status};
 let payload;try{payload=await response.json();}catch{return {ok:false,reason:'invalid_json'};}
 return {ok:true,status:response.status,rest_paths:Object.keys(payload.paths||{}).length};
}
if(require.main===module)probe().then(x=>{console.log(JSON.stringify(x));if(!x.ok)process.exitCode=1;}).catch(x=>{console.error(x.message);process.exitCode=1;});
module.exports={config,probe};
