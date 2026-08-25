const ports=new Set();
const memory=new Map();
function keyOf(x){return `${x.namespace||'default'}:${x.sha256||''}`}
onconnect=e=>{
  const port=e.ports[0]; ports.add(port); port.start();
  port.onmessage=ev=>{
    const m=ev.data||{}; const key=keyOf(m);
    if(m.type==='put'){
      if(!m.sha256) return port.postMessage({id:m.id,error:'sha256 required'});
      memory.set(key,m.value); return port.postMessage({id:m.id,ok:true});
    }
    if(m.type==='get') return port.postMessage({id:m.id,hit:memory.has(key),value:memory.get(key)});
    if(m.type==='delete-namespace'){
      for(const k of [...memory.keys()]) if(k.startsWith(`${m.namespace}:`)) memory.delete(k);
      return port.postMessage({id:m.id,ok:true});
    }
  };
  port.onmessageerror=()=>{};
};
export const sharedCacheContract={mode:'multi-tab-sha-shared-worker-cache-v1',keyIncludesSha256:true,crossVersionStaleReuse:false,sourceAssetsModified:false};
