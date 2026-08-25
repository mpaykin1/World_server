export async function registerQualityServiceWorker(){
  if(!('serviceWorker' in navigator)) return {registered:false,reason:'unsupported'};
  try{
    const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    return {registered:true,scope:reg.scope,mode:'sha-versioned-offline-cache-v1'};
  }catch(error){ return {registered:false,reason:String(error)}; }
}
export const offlineCacheContract={sourceAssetsModified:false,allowTextureDownscale:false,allowGeometryRewrite:false,staleCrossVersionReuse:false};
