'use strict';
(function(){
  if(window.CinematicVisibilitySupervisor)return;
  const adapters=new Set();
  let quality={tier:'BALANCED',fps:0,frameP95Ms:null};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function importance(distance,screenCenterDistance=0,hero=false){
    const d=1/(1+Math.max(0,distance)*.055),center=1-clamp(screenCenterDistance,0,1),h=hero?1:.0;
    return clamp(.55*d+.30*center+.15*h,0,1);
  }
  function profile(q){
    const tier=String(q?.tier||quality.tier||'BALANCED');
    const p={tier,occlusion:true,frustum:true,hzbPreferred:true,instanceClustering:true,clusterCellMeters:16,importanceRadius:22,maxVisibleClusters:96,farVoxelScale:.70,nearVoxelScale:1.0,heroFloor:.90};
    if(tier==='SAFE')Object.assign(p,{clusterCellMeters:24,importanceRadius:15,maxVisibleClusters:44,farVoxelScale:.48,nearVoxelScale:.82,heroFloor:.78});
    if(tier==='HIGH')Object.assign(p,{clusterCellMeters:14,importanceRadius:28,maxVisibleClusters:140,farVoxelScale:.86,nearVoxelScale:1.08,heroFloor:.96});
    if(tier==='ULTRA')Object.assign(p,{clusterCellMeters:12,importanceRadius:36,maxVisibleClusters:220,farVoxelScale:1,nearVoxelScale:1.20,heroFloor:1});
    return p;
  }
  function apply(q){quality={...quality,...q};const p=profile(quality);for(const a of adapters){
    try{a.setFrustumCulling?.(true);a.setOcclusionCulling?.(true);a.setHzbOcclusion?.(p.hzbPreferred);a.setInstanceClustering?.({enabled:true,cellMeters:p.clusterCellMeters,maxVisibleClusters:p.maxVisibleClusters});a.setImportanceDetail?.({radius:p.importanceRadius,nearScale:p.nearVoxelScale,farScale:p.farVoxelScale,heroFloor:p.heroFloor,importance});}catch{}
  }}
  function register(a){if(!a)return()=>{};adapters.add(a);apply(quality);return()=>adapters.delete(a)}
  addEventListener('worldqualitychange',e=>apply(e.detail||{}));
  addEventListener('worldqualitysample',e=>{quality={...quality,...(e.detail||{})}});
  window.CinematicVisibilitySupervisor={version:'1.0.0',register,importance,profile,getState:()=>quality};
})();
