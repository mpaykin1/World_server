'use strict';
(function(){
  if(window.CinematicVoxelQualityGuard?.version==='3.0.0') return;

  const POLICY_DEFAULT={
    minDepthLayers:3,minHeroLights:2,minNearVoxelDensityRatio:.72,minAtmosphereQualityRatio:.45,minMaterialLayers:3,
    scoreFloor:88,target:98
  };
  const adapters=new Set();
  const history=[];
  let lastQuality=null;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
  const scoreRatio=(value,floor,target)=>{
    if(value>=target)return 100;
    if(value<=0)return 0;
    if(value<floor)return 100*value/Math.max(.0001,floor)*.82;
    return 82+(value-floor)/Math.max(.0001,target-floor)*18;
  };

  function defaultStats(){
    return {
      depthLayers:0,heroLights:0,nearVoxelDensityRatio:0,atmosphereQualityRatio:0,materialLayers:0,
      navigatorUiPresent:false,eyeIntegrated:false,fireGeometry:false,fireGlow:false,fireLightSpill:false,
      emptyScreenRatio:1,foregroundReadable:false,midgroundReadable:false,backgroundReadable:false,
      materialVariationRatio:0,localContrastRatio:0,warmColdSeparation:false
    };
  }

  function collect(adapter){
    let s=defaultStats();
    try{s={...s,...(adapter.getCinematicStats?.()||{}),...(adapter.getVoxelStats?.()||{})}}catch(e){s.error=String(e?.message||e)}
    return s;
  }

  function auditAdapter(adapter,{repair=false}={}){
    const s=collect(adapter),f=[];
    if(s.depthLayers<POLICY_DEFAULT.minDepthLayers)f.push('depth_layers');
    if(s.heroLights<POLICY_DEFAULT.minHeroLights)f.push('hero_lights');
    if(s.nearVoxelDensityRatio<POLICY_DEFAULT.minNearVoxelDensityRatio)f.push('near_voxel_density');
    if(s.atmosphereQualityRatio<POLICY_DEFAULT.minAtmosphereQualityRatio)f.push('atmosphere');
    if(s.materialLayers<POLICY_DEFAULT.minMaterialLayers)f.push('material_layers');
    if(s.navigatorUiRequired!==false&&!s.navigatorUiPresent)f.push('navigator_ui');
    if(!s.eyeIntegrated)f.push('eye_integration');
    if(!(s.fireGeometry&&s.fireGlow&&s.fireLightSpill))f.push('fire_beacon');
    if(Number(s.emptyScreenRatio)>.52)f.push('empty_screen');
    if(!(s.foregroundReadable&&s.midgroundReadable&&s.backgroundReadable))f.push('plane_readability');
    if(!s.warmColdSeparation)f.push('warm_cold_separation');

    const detail=scoreRatio(s.nearVoxelDensityRatio,.72,1.15);
    const depth=scoreRatio(s.depthLayers,3,4);
    const light=scoreRatio(s.heroLights,2,4);
    const atmosphere=scoreRatio(s.atmosphereQualityRatio,.45,1);
    const materials=scoreRatio(s.materialLayers,3,5)*.75+scoreRatio(s.materialVariationRatio,.35,.8)*.25;
    const composition=(s.foregroundReadable?25:0)+(s.midgroundReadable?25:0)+(s.backgroundReadable?25:0)+(s.emptyScreenRatio<=.52?25:0);
    const hero=(s.eyeIntegrated?45:0)+(s.fireGeometry&&s.fireGlow&&s.fireLightSpill?45:0)+(s.warmColdSeparation?10:0);
    const ui=s.navigatorUiRequired===false?100:(s.navigatorUiPresent?100:0);
    const score=Math.round(detail*.18+depth*.12+light*.12+atmosphere*.13+materials*.10+composition*.13+hero*.15+ui*.07);
    const result={pass:f.length===0&&score>=POLICY_DEFAULT.scoreFloor,score,failures:f,stats:s,ts:Date.now()};
    history.push(result); if(history.length>60)history.shift();
    if(repair&&!result.pass)repairAdapter(adapter,result);
    return result;
  }

  function repairAdapter(adapter,result){
    const f=new Set(result.failures);
    try{
      if(f.has('depth_layers')) adapter.ensureDepthLayers?.(3);
      if(f.has('hero_lights')) adapter.ensureHeroLighting?.({minLights:2,warmCold:true});
      if(f.has('near_voxel_density')) adapter.increaseNearVoxelDensity?.({floor:.72,target:1.0});
      if(f.has('atmosphere')) adapter.ensureVolumetricAtmosphere?.({floor:.45});
      if(f.has('material_layers')) adapter.ensureMaterialLayers?.(3);
      if(f.has('navigator_ui')) adapter.ensureNavigatorUi?.();
      if(f.has('eye_integration')) adapter.integrateEyeIntoWorld?.();
      if(f.has('fire_beacon')) adapter.upgradeFireBeacon?.({geometry:true,glow:true,lightSpill:true});
      if(f.has('empty_screen')) adapter.fillMeaningfulWorldDetail?.({preserveComposition:true});
      if(f.has('plane_readability')) adapter.ensureDepthReadability?.();
      if(f.has('warm_cold_separation')) adapter.ensureWarmColdSeparation?.();
    }catch(e){result.repairError=String(e?.message||e)}
  }

  function qualityProfile(q){
    const tier=String(q?.tier||'BALANCED');
    const fps=Number(q?.fps||q?.targetFps||0);
    const pressure=String(q?.reason||'').includes('pressure');
    const profile={
      tier,
      nearHeroQualityFloor:.72,
      atmosphereFloor:.45,
      materialLayerFloor:3,
      reduceFirst:['occluded','far-density','far-shadows','secondary-particles','far-materials','atmosphere-samples','resolution'],
      protect:['eye','fire','navigator-ui','near-geometry','foreground-silhouette']
    };
    if(tier==='ULTRA')Object.assign(profile,{nearHeroQualityFloor:1,atmosphereFloor:.9,materialLayerFloor:5});
    else if(tier==='HIGH')Object.assign(profile,{nearHeroQualityFloor:.9,atmosphereFloor:.75,materialLayerFloor:4});
    else if(tier==='SAFE')Object.assign(profile,{nearHeroQualityFloor:.72,atmosphereFloor:.45,materialLayerFloor:3});
    profile.pressure=pressure; profile.fps=fps;
    return profile;
  }

  function applyQuality(q){
    lastQuality=q;
    const p=qualityProfile(q);
    for(const a of adapters){
      try{a.applyCinematicProfile?.(p)}catch{}
      const r=auditAdapter(a,{repair:true});
      if(!r.pass)dispatchEvent(new CustomEvent('cinematicqualityviolation',{detail:r}));
    }
  }

  function persistEvidence(detail){
    try{
      const key='world_server_cinematic_quality_v3';
      const prev=JSON.parse(localStorage.getItem(key)||'[]');
      prev.push(detail); while(prev.length>24)prev.shift();
      localStorage.setItem(key,JSON.stringify(prev));
    }catch{}
    try{
      const body=JSON.stringify({type:'cinematic_quality',app:(location.pathname.match(/\/apps\/([^/]+)/)||[])[1]||'unknown',path:location.pathname,ts:Date.now(),...detail});
      if(navigator.sendBeacon)navigator.sendBeacon('/api/quality-telemetry',new Blob([body],{type:'application/json'}));
    }catch{}
  }

  function auditAll({repair=false}={}){
    const reports=Array.from(adapters,a=>auditAdapter(a,{repair}));
    const score=reports.length?Math.round(reports.reduce((n,r)=>n+r.score,0)/reports.length):0;
    const result={pass:reports.length>0&&reports.every(r=>r.pass),score,reports,quality:lastQuality,ts:Date.now()};
    persistEvidence({score:result.score,pass:result.pass,adapterCount:reports.length});
    return result;
  }

  function registerSceneAdapter(adapter){
    if(!adapter||typeof adapter!=='object')return()=>{};
    adapters.add(adapter);
    try{adapter.setQualityGuard?.(window.CinematicVoxelQualityGuard)}catch{}
    const initial=auditAdapter(adapter,{repair:true});
    if(!initial.pass)dispatchEvent(new CustomEvent('cinematicqualityviolation',{detail:initial}));
    return()=>adapters.delete(adapter);
  }

  addEventListener('worldqualitychange',e=>applyQuality(e.detail||{}));
  addEventListener('worldqualitysample',e=>{
    const d=e.detail||{};
    if(Number(d.fps)>0)persistEvidence({tier:d.tier,fps:d.fps,gpuMs:d.gpuMs,frameP95Ms:d.frameP95Ms});
  });
  setInterval(()=>{if(adapters.size)auditAll({repair:true})},5000);

  window.CinematicVoxelQualityGuard={version:'3.0.0',registerSceneAdapter,auditAll,auditAdapter,getHistory:()=>history.slice(),getQuality:()=>lastQuality,qualityProfile};
  dispatchEvent(new CustomEvent('cinematicqualityguardready'));
})();
