'use strict';
(function(){
  if(window.InfiniteWorldStandard) return;
  const worlds=new Map();
  function register(id,adapter={}){
    if(!id||typeof adapter!=='object')throw new Error('InfiniteWorldStandard.register requires id + adapter');
    if(adapter.infinite!==true)throw new Error(`${id}: infinite flag required`);
    if(!Number.isFinite(adapter.chunkSize)||adapter.chunkSize<=0)throw new Error(`${id}: chunkSize required`);
    if(adapter.deterministic!==true)throw new Error(`${id}: deterministic chunk generation required`);
    if(typeof adapter.ensureAround!=='function')throw new Error(`${id}: ensureAround(player) required`);
    const entry={id,contract:'WORLD_INFINITE_CHUNKS_V1',...adapter,registeredAt:Date.now()};worlds.set(id,entry);return entry;
  }
  function get(id){return worlds.get(id)||null;}
  function audit(id){
    const w=get(id);if(!w)return{ok:false,reason:'not_registered'};
    return{ok:w.infinite===true&&w.deterministic===true&&typeof w.ensureAround==='function',contract:w.contract,chunkSize:w.chunkSize,loaded:typeof w.loadedChunks==='function'?w.loadedChunks():null};
  }
  window.InfiniteWorldStandard={contract:'WORLD_INFINITE_CHUNKS_V1',register,get,audit,list:()=>[...worlds.keys()]};
})();
