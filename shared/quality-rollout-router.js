'use strict';
(function(){
  if(window.__WORLD_SERVER_QUALITY_ROLLOUT_ROUTER__) return;
  window.__WORLD_SERVER_QUALITY_ROLLOUT_ROUTER__ = true;
  const endpoint='/api/quality-rollout-config';
  const qs=new URLSearchParams(location.search);
  if(qs.get('quality_rollout')==='off') return;
  function stableId(){
    const key='worldServerQualityRolloutDeviceId';
    try{
      let v=localStorage.getItem(key);
      if(!v){v=(crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random()}`;localStorage.setItem(key,v)}
      return v;
    }catch(_){return `${navigator.language}|${screen.width}x${screen.height}|${navigator.hardwareConcurrency||0}`}
  }
  async function bucketFor(text){
    try{
      const b=new TextEncoder().encode(text),d=await crypto.subtle.digest('SHA-256',b),a=new Uint8Array(d);
      return (((a[0]<<8)|a[1])%10000)/100;
    }catch(_){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0)%10000/100}
  }
  function sameHost(url){try{return new URL(url).host===location.host}catch(_){return false}}
  function redirect(base){
    try{
      const u=new URL(base);u.pathname=location.pathname;u.search=location.search;u.hash=location.hash;
      if(u.href!==location.href) location.replace(u.href);
    }catch(_){}
  }
  fetch(endpoint,{cache:'no-store',headers:{accept:'application/json'}}).then(async r=>{
    if(!r.ok)return null;return r.json();
  }).then(async cfg=>{
    if(!cfg||cfg.ok!==true)return;
    const stage=Number(cfg.stagePercent||0),candidate=String(cfg.candidateUrl||''),production=String(cfg.productionBaseUrl||'');
    const rolloutId=String(cfg.rolloutId||'');
    const onCandidate=candidate&&sameHost(candidate);
    if(cfg.state==='aborted'||cfg.state==='complete'||stage<=0||!candidate){
      window.__QUALITY_ROLLOUT__={rolloutId,stagePercent:stage,bucket:null,selected:false,state:cfg.state||'inactive'};
      if(onCandidate&&production&&!sameHost(production))redirect(production);
      return;
    }
    const bucket=await bucketFor(`${rolloutId}|${stableId()}`),selected=bucket<stage;
    window.__QUALITY_ROLLOUT__={rolloutId,stagePercent:stage,bucket,selected,state:cfg.state||'active',candidateUrl:candidate};
    if(onCandidate)return;
    if(selected)redirect(candidate);
  }).catch(()=>{});
})();
