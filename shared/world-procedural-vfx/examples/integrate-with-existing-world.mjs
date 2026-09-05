// TEMPLATE ONLY. Desktop AI must adapt imports to the selected real app and REUSE its THREE/scene/renderer/camera/render loop.
import {createWorldProceduralVfxEngine,planSemanticVfx,detectVfxCapabilities,recommendedInitialTier,createWorldServerQualityTelemetryBridge,bindWorldQualityToVfx} from '../runtime/index.mjs';

export function attachProceduralVfx({THREE,scene,renderer,camera,getActiveCamera=()=>camera,existingGroundResolver,existingWorldEventBus,worldQuality=globalThis.WorldQualityAutopilot}){
  const caps=detectVfxCapabilities({renderer});
  const vfx=createWorldProceduralVfxEngine({THREE,scene,renderer,camera,resolveGround:existingGroundResolver,telemetry:createWorldServerQualityTelemetryBridge(),qualityTier:recommendedInitialTier(caps)});
  const qualityBinding=bindWorldQualityToVfx({worldQuality,vfx});
  const onWorldEvent=(message)=>{const recipes=planSemanticVfx({intent:message.intent||message.semantic||'reveal',position:message.position||[0,0,0],target:message.target,seed:message.seed,importance:message.importance||1,idPrefix:message.id||'world'});vfx.spawnMany(recipes);};
  existingWorldEventBus?.on?.('world:vfx:semantic',onWorldEvent);
  return {vfx,tick:(dt,time)=>{vfx.setCamera(getActiveCamera());vfx.tick(dt,time);},dispose:()=>{existingWorldEventBus?.off?.('world:vfx:semantic',onWorldEvent);qualityBinding.dispose();vfx.dispose();}};
}
