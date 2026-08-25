'use strict';
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function resilientFetch(url,options={}){
  const retries=Math.max(0,Math.min(Number(options.retries??2),5)),timeoutMs=Math.max(100,Number(options.timeoutMs||2000)),retryStatuses=new Set(options.retryStatuses||[408,425,429,500,502,503,504]);
  let last=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const started=Date.now();
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('timeout')),timeoutMs);
      const r=await fetch(url,{...options,signal:controller.signal});clearTimeout(timer);
      if(r.ok||!retryStatuses.has(r.status))return{response:r,attempts:attempt+1,durationMs:Date.now()-started};
      last=new Error(`HTTP ${r.status}`);
    }catch(e){last=e}
    if(attempt<retries)await sleep(Math.min(800,100*(2**attempt)));
  }
  throw last||new Error('resilientFetch failed');
}
async function fetchJson(url,options={}){
  const x=await resilientFetch(url,options),text=await x.response.text();let json;
  try{json=JSON.parse(text)}catch(_){const e=new Error('malformed JSON response');e.status=x.response.status;e.body=text.slice(0,200);throw e}
  return{...x,json};
}
module.exports={resilientFetch,fetchJson};
