import * as THREE from 'three';
import { InputController } from './input.js';
import { PlayerController } from './player-controller.js';
import { RUNTIME_STANDARD, validateManifest, formatQualityFailure } from './quality-gate.js';
import { loadWorld, findSafeSpawn } from './world-loader.js';
import { PerformanceGovernor } from './performance-governor.js';
import { GameplayCore } from './gameplay-core.js';
import { QualityTelemetry } from './quality-telemetry.js';
import { fitLightingToWorld, validateRuntimeMaterials } from './lighting-quality.js';
import { AtmosphereQualitySystem } from './atmosphere-quality.js';
import { WetSurfaceSystem } from './wet-surface-system.js';
import { ProximityQualityManager } from './proximity-quality.js';
import { applyBakedLighting } from './baked-lighting.js';
import { DynamicEnvironmentRuntime } from './dynamic-environment.js';
import { FpsQualityOptimizer } from './fps-quality-optimizer.js';
import { deduplicateExactMaterials } from './material-deduplicator.js';
import { StaticReflectionProbeSystem } from './reflection-probes.js';
import { GpuOcclusionManager } from './gpu-occlusion-manager.js';
import { OptimizationOrchestrator } from './optimization-orchestrator.js';
import { StaticShadowCache } from './static-shadow-cache.js';
import { cacheReport } from './asset-cache.js';
import { WebGPUHzbVisibility } from './webgpu-hzb-visibility.js';
import { WebGPUMeshletIndirectKernel } from './webgpu-meshlet-indirect.js';
import { getQualitySimd } from './wasm-simd-codec.js';
import { auditThreeSceneMaterialParity } from './webgpu-pbr-renderer.js';
import { sharedMemoryCapability } from './shared-memory-decode.js';
import { WebGPUMaterialTable } from './webgpu-material-table.js';
import { ClusteredLightCuller } from './webgpu-clustered-lighting.js';
import { VirtualTextureResidency } from './virtual-texture-residency.js';
import { PortalVisibilitySystem } from './portal-visibility.js';
import { ScreenSpaceAnimationBudget } from './animation-budget.js';
import { SpatialHashBroadphase } from './physics-spatial-broadphase.js';
import { NetworkDeltaCodec } from './network-delta-codec.js';
import { DevicePerformanceSchedule } from './device-performance-schedule.js';
import { FrameBudgetOrchestrator } from './frame-budget-orchestrator.js';
import { registerQualityServiceWorker } from './offline-cache-manager.js';

const els = {
  canvas: document.getElementById('viewport'), loading: document.getElementById('loading'), loadingText: document.getElementById('loadingText'),
  startPanel: document.getElementById('startPanel'), worldTitle: document.getElementById('worldTitle'), qualityStatus: document.getElementById('qualityStatus'),
  enterButton: document.getElementById('enterButton'), hud: document.getElementById('hud'), debugBadge: document.getElementById('debugBadge'),
  mobileControls: document.getElementById('mobileControls'), moveZone: document.getElementById('moveZone'), lookZone: document.getElementById('lookZone'),
  jumpButton: document.getElementById('jumpButton'), stickKnob: document.getElementById('stickKnob'), fatal: document.getElementById('fatal'), fatalText: document.getElementById('fatalText'),
};

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111523);
scene.fog = null; // V8 atmosphere configures distance fog; near-field source detail remains untouched.
const camera = new THREE.PerspectiveCamera(68, 1, 0.03, 3000); scene.add(camera);
const listener = new THREE.AudioListener(); camera.add(listener);

const hemi = new THREE.HemisphereLight(0xb8cfff, 0x2f241c, 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd5a1, 2.1);
sun.position.set(-8,18,12); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.bias = -0.00015; scene.add(sun);

const input = new InputController({ canvas:els.canvas, moveZone:els.moveZone, lookZone:els.lookZone, jumpButton:els.jumpButton, stickKnob:els.stickKnob });
let webgpuPbrAudit=null;
let world=null, player=null, gameplay=null, governor=null, telemetry=null, atmosphere=null, wetSurfaces=null, proximityQuality=null, dynamicEnvironment=null, fpsOptimizer=null, reflectionProbes=null, gpuOcclusion=null, webgpuHzb=null, meshletIndirect=null, optimization=null, shadowCache=null, simdCodec=null, materialTable=null, clusteredLights=null, virtualTextures=null, portalVisibility=null, animationBudget=null, physicsBroadphase=null, networkDelta=null, deviceSchedule=null, frameBudget=null, running=false;
let lastTime=performance.now(), fpsWindowStart=lastTime, fpsFrames=0, fps=0;

function setLoading(text){ els.loadingText.textContent=text; els.loading.classList.remove('hidden'); }
function fatal(error){
  console.error(error); telemetry?.recordError?.('runtime-fatal',String(error?.message||error));
  els.loading.classList.add('hidden'); els.startPanel.classList.add('hidden');
  els.fatalText.textContent=error instanceof Error?`${error.message}\n\n${error.stack||''}`:String(error); els.fatal.classList.remove('hidden');
}
async function fetchJSON(url){ const r=await fetch(url,{cache:'no-cache'}); if(!r.ok)throw new Error(`HTTP ${r.status} while loading ${url}`); return r.json(); }
function resolveWorldId(registry){
  const requested=new URLSearchParams(location.search).get('world');
  if(requested&&registry.worlds.some(w=>w.id===requested&&w.enabled!==false))return requested;
  const first=registry.worlds.find(w=>w.enabled!==false); if(!first)throw new Error('No enabled worlds in registry.json'); return first.id;
}
function resize(){
  const w=innerWidth,h=innerHeight; const maxDpr=input.isCoarse?1.75:2.25;
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,maxDpr)); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); atmosphere?.resize?.(w,h,renderer.getPixelRatio());
}
addEventListener('resize',resize); resize();

async function boot(){
  try{
    setLoading('Читаю реестр миров…');
    const registry=await fetchJSON('./worlds/registry.json');
    if(registry.runtime!==RUNTIME_STANDARD.id)throw new Error(`Runtime mismatch: registry=${registry.runtime}, expected=${RUNTIME_STANDARD.id}`);
    const worldId=resolveWorldId(registry), entry=registry.worlds.find(w=>w.id===worldId);
    const manifestUrl=new URL(entry.manifest,location.href).href, manifest=await fetchJSON(manifestUrl), base=new URL('.',manifestUrl);
    manifest.visual.url=new URL(manifest.visual.url,base).href;
    if(manifest.collision?.url)manifest.collision.url=new URL(manifest.collision.url,base).href;
    if(manifest.semantic?.url){ manifest.semantic.url=new URL(manifest.semantic.url,base).href; manifest.semantic.data=await fetchJSON(manifest.semantic.url); }
    if(Array.isArray(manifest.streaming?.chunks)){ for(const chunk of manifest.streaming.chunks) chunk.url=new URL(chunk.url,base).href; }
    if(manifest.navigation?.url){ manifest.navigation.url=new URL(manifest.navigation.url,base).href; manifest.navigation.data=await fetchJSON(manifest.navigation.url); }
    if(manifest.player?.modelUrl)manifest.player.modelUrl=new URL(manifest.player.modelUrl,base).href;
    if(manifest.lightingBake?.descriptorUrl)manifest.lightingBake.descriptorUrl=new URL(manifest.lightingBake.descriptorUrl,base).href;
    if(manifest.streaming?.rangePlanUrl)manifest.streaming.rangePlanUrl=new URL(manifest.streaming.rangePlanUrl,base).href;
    if(manifest.graphics?.reflectionProbes?.descriptorUrl)manifest.graphics.reflectionProbes.descriptorUrl=new URL(manifest.graphics.reflectionProbes.descriptorUrl,base).href;
    if(manifest.graphics?.meshlets?.url){manifest.graphics.meshlets.url=new URL(manifest.graphics.meshlets.url,base).href;try{manifest.graphics.meshlets.data=await fetchJSON(manifest.graphics.meshlets.url);}catch(e){console.warn('meshlet metadata unavailable',e);}}
    simdCodec=await getQualitySimd();

    const report=validateManifest(manifest); if(!report.pass)throw new Error(formatQualityFailure(report));
    els.worldTitle.textContent=manifest.title;
    els.qualityStatus.textContent=`QUALITY GATE: ${report.score}% PASS${report.warnings.length?` · ${report.warnings.length} WARN`:''}`; els.qualityStatus.classList.add('pass');

    world=await loadWorld({scene,renderer,manifest,onProgress:text=>setLoading(text)});
    setLoading('Проверяю безопасный spawn…');
    const playerConfig={...RUNTIME_STANDARD.defaultPlayer,...(manifest.player||{})}, spawn=findSafeSpawn(world,playerConfig);
    player=new PlayerController({camera,collider:world.collider,spawn,config:playerConfig,worldBounds:world.bounds}); player.addToScene(scene);
    const lightingReport=fitLightingToWorld({sun,hemi,worldBounds:world.bounds,renderer,manifest});
    const materialReport=world.visual?.root?validateRuntimeMaterials(world.visual.root):{pass:true,issues:[]};
    webgpuPbrAudit=auditThreeSceneMaterialParity(world.visual?.root||scene);
    if(!materialReport.pass) throw new Error(`Material quality gate failed: ${JSON.stringify(materialReport.issues)}`);

    const size=world.bounds.getSize(new THREE.Vector3()).length(); camera.near=Math.max(0.02,Math.min(0.08,size/20000)); camera.far=Math.max(300,size*8); camera.updateProjectionMatrix();
    const bakedLightingReport=await applyBakedLighting({world,manifest});
    const materialDedupReport=deduplicateExactMaterials(world.visual?.root||scene);
    reflectionProbes=new StaticReflectionProbeSystem({renderer,scene,manifest});
    const probePos=spawn.clone().add(new THREE.Vector3(0,Math.max(1.2,playerConfig.eyeHeight||1.58),0));
    const reflectionReport=await reflectionProbes.capture(probePos);
    wetSurfaces=new WetSurfaceSystem({renderer,scene,manifest}); wetSurfaces.scan(world.visual?.root||scene);
    atmosphere=new AtmosphereQualitySystem({renderer,scene,camera,bounds:world.bounds,manifest}); atmosphere.resize(innerWidth,innerHeight,renderer.getPixelRatio()); world?.streaming?.setVisibilityRange?.(atmosphere.baseFar);
    proximityQuality=new ProximityQualityManager({root:world.visual?.root||scene,scene,manifest}); proximityQuality.setFogRange(atmosphere.baseNear,atmosphere.baseFar);
    world.streaming?.setVisibilityRange?.(atmosphere.baseFar);

    gameplay=new GameplayCore(player,manifest.navigation?.data||null);
    dynamicEnvironment=new DynamicEnvironmentRuntime({root:world.visual?.root||scene,player,manifest});
    fpsOptimizer=new FpsQualityOptimizer({renderer,scene,camera,root:world.visual?.root||scene,manifest,player,atmosphere});
    optimization=new OptimizationOrchestrator({manifest});
    shadowCache=new StaticShadowCache({renderer,root:world.visual?.root||scene,manifest});
    webgpuHzb=new WebGPUHzbVisibility({root:world.visual?.root||scene,camera,player,manifest});
    const hzbReport=await webgpuHzb.init();
    if(!hzbReport.supported)gpuOcclusion=new GpuOcclusionManager({renderer,scene,camera,root:world.visual?.root||scene,manifest,player,atmosphere});
    if(hzbReport.supported&&manifest.graphics?.meshlets?.data?.meshlets){meshletIndirect=new WebGPUMeshletIndirectKernel(webgpuHzb.device,manifest.graphics.meshlets.data.meshlets);meshletIndirect.init();meshletIndirect.updateVisibility();}
    materialTable=new WebGPUMaterialTable(webgpuHzb?.device||null); if(webgpuHzb?.device){world.visual?.root?.traverse?.(o=>{const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!m)continue;materialTable.add({baseColorFactor:[...(m.color?.toArray?.()||[1,1,1]),m.opacity??1],emissiveFactor:m.emissive?.toArray?.()||[0,0,0],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??1,occlusionStrength:m.aoMapIntensity??1,normalScaleFactor:m.normalScale?.x??1,alphaCutoff:m.alphaTest??0});}});materialTable.upload();}
    clusteredLights=new ClusteredLightCuller(webgpuHzb?.device||null,{nearCriticalRadius:42});
    virtualTextures=new VirtualTextureResidency(manifest.graphics?.virtualTextureResidency||{});
    portalVisibility=new PortalVisibilitySystem(manifest.visibility?.portalGraph||{});
    animationBudget=new ScreenSpaceAnimationBudget(manifest.animationBudget||{});
    physicsBroadphase=new SpatialHashBroadphase(manifest.physicsBroadphase||{});
    networkDelta=new NetworkDeltaCodec(); frameBudget=new FrameBudgetOrchestrator(manifest.frameBudget||{});
    deviceSchedule=new DevicePerformanceSchedule(manifest.performanceSchedule||{profile:'default',knobs:{}});
    deviceSchedule.apply({streaming:world.streaming,animation:animationBudget,network:optimization?.network,physics:physicsBroadphase});
    governor=new PerformanceGovernor({renderer,scene,targetFps:RUNTIME_STANDARD.minDesktopFps,mobileTargetFps:RUNTIME_STANDARD.minMobileFps,isMobile:input.isCoarse});
    telemetry=new QualityTelemetry({worldId,player,governor});
    telemetry.event('spawn-pass',{position:spawn.toArray()}); telemetry.event('lighting-quality',lightingReport); telemetry.event('baked-lighting',bakedLightingReport); telemetry.event('material-quality',materialReport); telemetry.event('material-dedup',materialDedupReport); telemetry.event('reflection-probes',reflectionReport); telemetry.event('wet-surface',wetSurfaces.report()); telemetry.event('atmosphere',atmosphere.report()); telemetry.event('dynamic-environment',dynamicEnvironment.report()); telemetry.event('fps-quality-optimizer',fpsOptimizer.report()); telemetry.event('gpu-occlusion',gpuOcclusion?.report?.()||{fallback:false}); telemetry.event('webgpu-hzb',webgpuHzb?.report?.()||{}); telemetry.event('webgpu-meshlet-indirect',meshletIndirect?.report?.()||{supported:false}); telemetry.event('webgpu-pbr-source-parity',webgpuPbrAudit||{pass:false,authorityAllowed:false}); telemetry.event('wasm-simd',simdCodec?.report?.()||simdCodec||{}); telemetry.event('optimization-orchestrator',optimization.report()); telemetry.event('static-shadow-cache',shadowCache.report()); telemetry.event('asset-cache',cacheReport()); telemetry.event('bvh-cache',world.collider?.userData?.bvhCache||{}); telemetry.event('shared-memory-decode',sharedMemoryCapability()); telemetry.event('webgpu-material-table',materialTable?.report?.()||{supported:false}); telemetry.event('clustered-lighting',clusteredLights?.report?.()||{}); telemetry.event('virtual-texture-residency',virtualTextures?.report?.()||{}); telemetry.event('portal-visibility',portalVisibility?.report?.()||{}); telemetry.event('animation-budget',animationBudget?.report?.()||{}); telemetry.event('physics-broadphase',physicsBroadphase?.report?.()||{}); telemetry.event('network-delta',networkDelta?.report?.()||{}); telemetry.event('device-performance-schedule',deviceSchedule?.report?.()||{}); telemetry.event('frame-budget',frameBudget?.report?.()||{});
    els.loading.classList.add('hidden'); els.startPanel.classList.remove('hidden'); els.enterButton.disabled=false;
    renderer.setAnimationLoop(frame);

    const params=new URLSearchParams(location.search);
    if(params.get('autoplay')==='1'||params.get('qa')==='1')enterWorld();
  }catch(err){fatal(err);}
}

function enterWorld(){
  if(!player||running)return; running=true; input.setEnabled(true); els.startPanel.classList.add('hidden'); els.hud.classList.remove('hidden');
  if(input.isCoarse){els.mobileControls.classList.remove('hidden');els.mobileControls.setAttribute('aria-hidden','false');} else input.requestPointerLock();
  telemetry?.event('enter-world');
}
els.enterButton.addEventListener('click',enterWorld);
els.enterButton.addEventListener('pointerup',e=>{if(e.pointerType==='touch')enterWorld();});

function frame(now){
  const dt=Math.min((now-lastTime)/1000,0.1); lastTime=now;
  if(running&&player){
    player.setInput(input.sample());player.update(dt);dynamicEnvironment?.update?.(dt);world?.streaming?.update?.(player.position,false,player.velocity);
    proximityQuality?.update?.(player.position,now);atmosphere?.update?.(player.position,dt);portalVisibility?.apply?.(world.visual?.root||scene,player.position);animationBudget?.update?.(dt);physicsBroadphase?.updateSleeping?.(dt,player.position);webgpuHzb?.update?.();gpuOcclusion?.update?.();optimization?.update?.(player.position,now,atmosphere?.baseFar??Infinity);
  }
  wetSurfaces?.update?.(now);governor?.sample(dt);atmosphere?.setPerformanceLevel?.(governor?.level??0);world?.streaming?.setPerformanceLevel?.(governor?.level??0);fpsOptimizer?.update?.(now,dt);telemetry?.sample(dt);
  if(atmosphere)atmosphere.render(scene,camera,now);else renderer.render(scene,camera);
  gpuOcclusion?.afterRender?.();

  fpsFrames++;
  if(now-fpsWindowStart>=500){
    fps=fpsFrames*1000/(now-fpsWindowStart); fpsFrames=0; fpsWindowStart=now;
    if(player){
      const target=input.isCoarse?RUNTIME_STANDARD.minMobileFps:RUNTIME_STANDARD.minDesktopFps;
      const perf=governor?.report();
      els.debugBadge.textContent=`${player.getDebugString()}\nFPS ${fps.toFixed(0)} / TARGET ${target}\nGOV ${perf?.decision||'—'} L${perf?.level??0}`;
      els.debugBadge.style.display=new URLSearchParams(location.search).get('debug')==='1'?'block':'none';
    }
  }
}

registerQualityServiceWorker().catch(()=>{});
boot();
