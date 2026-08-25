import * as THREE from 'three';

const VERT=`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;
const FRAG=`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
uniform float uShimmerStart;
uniform float uShimmerEnd;
uniform float uStrength;
uniform float uWetIntensity;
uniform vec2 uResolution;
varying vec2 vUv;
float viewDistance(float depth){
  float viewZ=(uNear*uFar)/((uFar-uNear)*depth-uFar);
  return max(0.0,-viewZ);
}
float lum(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
void main(){
  float d=texture2D(tDepth,vUv).x;
  float dist=viewDistance(d);
  float farMask=smoothstep(uShimmerStart,uShimmerEnd,dist);
  float horizonMask=smoothstep(0.08,0.34,vUv.y)*(1.0-smoothstep(0.68,0.92,vUv.y));
  float wave1=sin(vUv.y*190.0+uTime*1.35);
  float wave2=sin(vUv.y*83.0-uTime*0.77+vUv.x*17.0);
  float px=max(1.0,uResolution.x);
  float shift=(wave1*0.62+wave2*0.38)*uStrength*farMask*horizonMask*(1920.0/px);
  vec2 uv=vec2(clamp(vUv.x+shift,0.001,0.999),vUv.y);
  vec3 col=texture2D(tDiffuse,uv).rgb;
  // Global subtle wet fallback: preserves source assets and gives non-PBR/custom/splat renderers a restrained reflective lift.
  if(uWetIntensity>0.0 && d<0.999999){
    float l=lum(col);
    float highlight=smoothstep(0.34,0.92,l)*(1.0-smoothstep(0.94,1.0,l));
    float grazing=0.55+0.45*smoothstep(0.12,0.78,vUv.y);
    col += vec3(highlight*grazing*uWetIntensity*0.115);
    col *= 1.0-uWetIntensity*0.018;
  }
  // Depth fog is applied in post too, so custom renderers inherit the same distance concealment.
  float fog=smoothstep(uFogNear,uFogFar,dist);
  if(d>=0.999999)fog=1.0;
  col=mix(col,uFogColor,clamp(fog*0.92,0.0,1.0));
  gl_FragColor=vec4(col,1.0);
}
`;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

export class AtmosphereQualitySystem{
  constructor({renderer,scene,camera,bounds,manifest}){
    this.renderer=renderer;this.scene=scene;this.camera=camera;this.bounds=bounds;this.manifest=manifest;
    const size=bounds.getSize(new THREE.Vector3());
    const span=Math.max(size.x,size.z,12);
    const cfg=manifest.graphics?.atmosphere||{};
    this.baseNear=cfg.fogNear ?? clamp(span*0.42,18,180);
    this.baseFar=cfg.fogFar ?? clamp(span*1.45,55,700);
    if(this.baseFar<=this.baseNear+12)this.baseFar=this.baseNear+12;
    this.color=new THREE.Color(cfg.color ?? 0x9aa0a7);
    scene.fog=new THREE.Fog(this.color,this.baseNear,this.baseFar);
    if(cfg.backgroundBlend!==false)scene.background=this.color.clone().multiplyScalar(cfg.backgroundBrightness??0.58);

    this.enabled=cfg.enabled!==false;this.postEnabled=cfg.postDepthFog!==false;
    this.shimmerEnabled=cfg.horizonShimmer!==false;this.qualityLevel=0;this.speed=0;
    this._lastPlayer=new THREE.Vector3();this._hasPlayer=false;
    const wet=manifest.materials?.wetSurface||{};

    this.target=new THREE.WebGLRenderTarget(16,16,{depthBuffer:true,stencilBuffer:false});
    this.target.texture.colorSpace=THREE.SRGBColorSpace;
    this.target.depthTexture=new THREE.DepthTexture(16,16,THREE.UnsignedIntType);
    this.target.depthTexture.format=THREE.DepthFormat;
    this.postScene=new THREE.Scene();this.postCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.material=new THREE.ShaderMaterial({
      vertexShader:VERT,fragmentShader:FRAG,depthWrite:false,depthTest:false,
      uniforms:{
        tDiffuse:{value:this.target.texture},tDepth:{value:this.target.depthTexture},uTime:{value:0},uNear:{value:camera.near},uFar:{value:camera.far},
        uFogNear:{value:this.baseNear},uFogFar:{value:this.baseFar},uFogColor:{value:this.color.clone()},
        uShimmerStart:{value:cfg.shimmerStart??Math.max(this.baseNear*0.8,12)},uShimmerEnd:{value:cfg.shimmerEnd??Math.max(this.baseNear*2.1,35)},
        uStrength:{value:cfg.shimmerStrength??0.00055},uWetIntensity:{value:wet.enabled===false?0:clamp(wet.intensity??0.14,0,0.25)},
        uResolution:{value:new THREE.Vector2(16,16)},
      }
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));
  }
  resize(width,height,dpr=1){const w=Math.max(2,Math.floor(width*dpr)),h=Math.max(2,Math.floor(height*dpr));this.target.setSize(w,h);this.material.uniforms.uResolution.value.set(w,h);}
  update(playerPosition,dt=0.016){
    if(playerPosition){if(this._hasPlayer&&dt>0)this.speed=this.speed*0.85+playerPosition.distanceTo(this._lastPlayer)/dt*0.15;this._lastPlayer.copy(playerPosition);this._hasPlayer=true;}
    const t=performance.now()*0.00015,breathing=1+Math.sin(t)*0.012;
    if(this.scene.fog){this.scene.fog.near=this.baseNear;this.scene.fog.far=this.baseFar*breathing;}
    this.material.uniforms.uFogFar.value=this.baseFar*breathing;
  }
  setPerformanceLevel(level){this.qualityLevel=level;this.shimmerEnabled=level<1&&this.manifest.graphics?.atmosphere?.horizonShimmer!==false;}
  render(scene,camera,nowMs){
    if(!this.enabled||!this.postEnabled){this.renderer.setRenderTarget(null);this.renderer.render(scene,camera);return;}
    this.material.uniforms.uTime.value=(nowMs||performance.now())*0.001;this.material.uniforms.uNear.value=camera.near;this.material.uniforms.uFar.value=camera.far;
    this.material.uniforms.uStrength.value=this.shimmerEnabled?(this.manifest.graphics?.atmosphere?.shimmerStrength??0.00055):0;
    this.renderer.setRenderTarget(this.target);this.renderer.clear();this.renderer.render(scene,camera);this.renderer.setRenderTarget(null);this.renderer.clear();this.renderer.render(this.postScene,this.postCamera);
  }
  report(){return{enabled:this.enabled,postDepthFog:this.postEnabled,fogNear:this.baseNear,fogFar:this.baseFar,horizonShimmer:this.shimmerEnabled,globalWetPostFallback:this.material.uniforms.uWetIntensity.value,sourceAssetsModified:false};}
  dispose(){this.target.dispose();this.material.dispose();this.postScene.traverse(o=>o.geometry?.dispose?.());}
}
