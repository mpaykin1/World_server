(() => {
'use strict';
const G=globalThis;if(G.CreatureFactoryTelemetry)return;
const endpoint='/api/quality-telemetry';
const app=(typeof location!=='undefined'&&(location.pathname.match(/\/apps\/([^/]+)/)||[])[1])||'creature-factory';
function record(type,data={}){
  const payload={type,app,path:typeof location!=='undefined'?location.pathname:'',ts:Date.now(),...data};
  const body=JSON.stringify(payload);
  try{
    if(typeof navigator!=='undefined'&&navigator.sendBeacon)navigator.sendBeacon(endpoint,new Blob([body],{type:'application/json'}));
    else if(typeof fetch==='function')fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{});
  }catch{}
}
G.CreatureFactoryTelemetry={version:'1.0.0',record};
})();
