export class StaticShadowCache{
 constructor({renderer,root,manifest}){this.renderer=renderer;this.root=root;this.manifest=manifest;this.frozen=false;this.dynamicCasters=0;root?.traverse?.(o=>{if(o.castShadow&&(o.isSkinnedMesh||o.userData?.dynamic===true))this.dynamicCasters++});if(manifest.graphics?.fpsOptimization?.staticShadowCache!==false&&this.dynamicCasters===0&&renderer.shadowMap){renderer.shadowMap.needsUpdate=true;setTimeout(()=>{renderer.shadowMap.autoUpdate=false;this.frozen=true},0)}}
 invalidate(){if(this.renderer.shadowMap){this.renderer.shadowMap.needsUpdate=true;}}
 report(){return{enabled:true,frozen:this.frozen,dynamicCasters:this.dynamicCasters,onlyWhenNoDynamicShadowCasters:true,visualQualityReduced:false};}
}
