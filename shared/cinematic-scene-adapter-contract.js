'use strict';
(function(){
 if(window.CinematicSceneAdapterContract)return;
 const REQUIRED_GENERIC=['getCinematicStats','applyCinematicProfile'];
 const OPTIONAL=['setFrustumCulling','setOcclusionCulling','setHzbOcclusion','setInstanceClustering','setImportanceDetail','applyTemporalQuality','captureDepthMap'];
 function validate(a){const missing=REQUIRED_GENERIC.filter(k=>typeof a?.[k]!=='function');return{pass:missing.length===0,missing,optionalAvailable:OPTIONAL.filter(k=>typeof a?.[k]==='function')}}
 function connect(a){
   const v=validate(a);if(!v.pass)return v;
   const off=[];
   off.push(window.CinematicVoxelQualityGuard?.registerSceneAdapter?.(a));
   off.push(window.CinematicVisibilitySupervisor?.register?.(a));
   off.push(window.CinematicTemporalQualityGovernor?.register?.(a));
   return {...v,disconnect(){for(const f of off)try{f?.()}catch{}}};
 }
 window.CinematicSceneAdapterContract={version:'1.0.0',validate,connect,required:REQUIRED_GENERIC.slice(),optional:OPTIONAL.slice()};
})();
