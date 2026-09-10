'use strict';
const { isStableProductionUrl }=require('../lib/manual-task-completion-contract');

async function verify(url,marker=''){
  if(!isStableProductionUrl(url)) throw new Error('FINAL_LINK_MUST_BE_STABLE_PRODUCTION_URL');
  const attempts=[];
  for(let i=0;i<3;i++){
    const u=new URL(url); u.searchParams.set('__link_gate',`${Date.now()}-${i}`);
    const r=await fetch(u,{redirect:'follow',headers:{'cache-control':'no-cache'}});
    const body=await r.text();
    const markerOk=!marker||body.includes(marker);
    attempts.push({status:r.status,finalUrl:r.url,markerOk});
    if(r.status!==200||!markerOk) throw new Error(`BROKEN_USER_LINK attempt=${i+1} status=${r.status} marker=${markerOk}`);
  }
  return {ok:true,url,marker:marker||null,attempts,checkedAt:new Date().toISOString()};
}

if(require.main===module){
  verify(process.argv[2],process.argv[3]||'').then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exit(1);});
}
module.exports={verify};
