import * as THREE from '../vendor/three-r160/three.module.min.js';
import {canonicalProfileFromRecipe,canonicalCorridorLayout,CANONICAL_HERO,canonicalLightIntent,canonicalLayoutSignature} from '../trinity-canonical-layout.mjs';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rng32(seed){let x=(Number(seed)||1)>>>0;return()=>{x=(x+0x6D2B79F5)|0;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function textureData(size,seed,sampler){
  const data=new Uint8Array(size*size*4),rand=rng32(seed);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,[r,g,b,a=255]=sampler(x,y,rand);data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
  return data;
}
function makeTexture(data,size,colorSpace=null){
  const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(3,3);tex.anisotropy=4;
  tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.generateMipmaps=true;
  if(colorSpace)tex.colorSpace=colorSpace;tex.needsUpdate=true;return tex;
}
function stoneHeight(size,seed){
  const rand=rng32(seed),h=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grout=(x%32<2||y%32<2)?-.72:0;
    const grain=(rand()-.5)*.34,vein=Math.sin(x*.73+y*.31+seed*.01)*.09;
    h[y*size+x]=grout+grain+vein;
  }
  return h;
}
function normalFromHeight(h,size,strength=2.8){
  const data=new Uint8Array(size*size*4),at=(x,y)=>h[((y+size)%size)*size+((x+size)%size)];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(at(x+1,y)-at(x-1,y))*strength,dy=(at(x,y+1)-at(x,y-1))*strength;
    const nz=1/Math.hypot(dx,dy,1),i=(y*size+x)*4;
    data[i]=Math.round((-dx*nz*.5+.5)*255);data[i+1]=Math.round((-dy*nz*.5+.5)*255);data[i+2]=Math.round((nz*.5+.5)*255);data[i+3]=255;
  }
  return data;
}
export function createKriegerSurfaceLibrary(renderer,seed=1){
  const size=128,height=stoneHeight(size,seed);
  const albedo=makeTexture(textureData(size,seed+17,(x,y,rand)=>{
    const mortar=(x%32<2||y%32<2),n=rand()*.14-.07,v=clamp((mortar?.28:.60)+n,0,1);
    return [v*152,v*160,v*168,255];
  }),size,THREE.SRGBColorSpace);
  const roughness=makeTexture(textureData(size,seed+23,(x,y,rand)=>{
    const mortar=(x%32<2||y%32<2),v=clamp((mortar?.96:.58)+(rand()-.5)*.24,0,1)*255;return[v,v,v,255];
  }),size);
  const normal=makeTexture(normalFromHeight(height,size,3.3),size);
  const maxAniso=renderer.capabilities.getMaxAnisotropy?.()||4;for(const t of [albedo,roughness,normal])t.anisotropy=Math.min(8,maxAniso);
  return {
    floorStone:new THREE.MeshStandardMaterial({color:0xd7dcdf,map:albedo,normalMap:normal,normalScale:new THREE.Vector2(.74,.74),roughness:.88,roughnessMap:roughness,metalness:.018}),
    stone:new THREE.MeshStandardMaterial({color:0xd7d8d4,map:albedo,normalMap:normal,normalScale:new THREE.Vector2(.76,.76),roughness:.64,roughnessMap:roughness,metalness:.045}),
    darkStone:new THREE.MeshStandardMaterial({color:0x68737c,map:albedo,normalMap:normal,normalScale:new THREE.Vector2(.62,.62),roughness:.76,roughnessMap:roughness,metalness:.035}),
    metal:new THREE.MeshStandardMaterial({color:0x242a30,roughness:.34,metalness:.82,normalMap:normal,normalScale:new THREE.Vector2(.14,.14)}),
    warmMetal:new THREE.MeshStandardMaterial({color:0x8f694d,roughness:.36,metalness:.58,normalMap:normal,normalScale:new THREE.Vector2(.20,.20)}),
    emissive:new THREE.MeshStandardMaterial({color:0xffd09a,emissive:0xff7a25,emissiveIntensity:5.0,roughness:.22,metalness:.04}),
    textures:[albedo,roughness,normal]
  };
}
function instanced(geometry,material,matrices,scene,castShadow=false,receiveShadow=true){
  const mesh=new THREE.InstancedMesh(geometry,material,matrices.length),dummy=new THREE.Object3D();
  matrices.forEach((m,i)=>{dummy.position.fromArray(m.p);dummy.rotation.set(...(m.r||[0,0,0]));dummy.scale.fromArray(m.s||[1,1,1]);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;scene.add(mesh);return mesh;
}
function installRhythm(runtime,layout,surfaces){
  const {profile}=layout,g=new THREE.Group();g.name='krieger.cinematic.architecture';runtime.scene.add(g);
  const m=layout,owned=[];
  const add=(geo,mat,data,cast=false,receive=true)=>{const x=instanced(geo,mat,data,g,cast,receive);owned.push(x);return x;};
  add(new THREE.BoxGeometry(1,1,1),surfaces.floorStone,m.floor,false,true);
  add(new THREE.BoxGeometry(1,1,1),surfaces.darkStone,m.walls,false,true);
  add(new THREE.CylinderGeometry(.34,.48,profile.height*.72,10),surfaces.stone,m.columns,false,true);
  add(new THREE.BoxGeometry(.92,.24,.92),surfaces.warmMetal,m.caps,false,true);
  const arch=new THREE.TorusGeometry(profile.halfWidth*.94,.16,8,28,Math.PI);
  add(arch,surfaces.stone,m.ribs,false,true);
  add(new THREE.BoxGeometry(1,1,1),surfaces.warmMetal,m.panels,false,true);
  add(new THREE.BoxGeometry(.58,.09,.28),surfaces.emissive,m.fixtures,false,false);
  runtime.qualityObjects.push({id:'render.architecture-rhythm',group:g,kind:'architecture-rhythm',semanticLayers:['macro','meso','micro','surface','props'],semanticTags:['corridor','column','arch','panel','fixture','instanced'],materialVariation:.88,surfaceMicrodetail:.92,flatSurfaceRatio:.18,concavity:.72,functionalComponents:8});
  runtime.cinematicArchitecture={group:g,owned,profile};return g;
}
function installLocalLights(runtime,recipe){
  const lights=[];
  for(const intent of canonicalLightIntent(recipe).filter(light=>light.kind==='local')){
    const light=new THREE.PointLight(intent.color,intent.intensity,intent.radius,intent.decay);
    light.position.set(...intent.position);light.castShadow=false;runtime.scene.add(light);lights.push(light);
  }
  const cool=new THREE.DirectionalLight(0x86a9cf,.88);cool.position.set(-4,8,-6);cool.castShadow=false;runtime.scene.add(cool);
  runtime.cinematicLights=[...lights,cool];return lights;
}
function heroPart(group,geometry,material,p,r=[0,0,0]){
  const m=new THREE.Mesh(geometry,material);m.position.fromArray(p);m.rotation.set(...r);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function heroGeometry(part){
  if(part.shape==='box')return new THREE.BoxGeometry(...part.size);
  if(part.shape==='cylinder')return new THREE.CylinderGeometry(part.radiusTop,part.radiusBottom,part.height,part.segments);
  return new THREE.TorusGeometry(part.radius,part.tube,part.radialSegments,part.tubularSegments);
}
function installHero(runtime,surfaces){
  const hero=new THREE.Group(),t=CANONICAL_HERO.transform;hero.name='hero.world-tool';
  hero.position.set(...t.position);hero.rotation.set(...t.rotation);hero.scale.setScalar(t.scale);
  for(const part of CANONICAL_HERO.parts){
    const node=heroPart(hero,heroGeometry(part),surfaces[part.material],part.p,part.r||[0,0,0]);
    if(part.scale)node.scale.set(...part.scale);
  }
  runtime.camera.add(hero);if(!runtime.camera.parent)runtime.scene.add(runtime.camera);
  const key=new THREE.PointLight(0xb9d4ef,11.5,4.5,1.7);key.position.set(.02,.30,-.50);runtime.camera.add(key);
  runtime.heroForeground=hero;runtime.heroKey=key;
  runtime.qualityObjects.push({id:'render.hero-world-tool',group:hero,kind:'hero-foreground',semanticLayers:['macro','meso','micro','surface','state','props'],semanticTags:['foreground','tool','receiver','barrel','rails','muzzle','indicator','grip'],materialVariation:.94,surfaceMicrodetail:.86,flatSurfaceRatio:.10,concavity:.62,functionalComponents:14,forceNearCamera:true});
  return hero;
}
export const cinematicProfileFromRecipe=canonicalProfileFromRecipe;
export function installKriegerCinematicStack(runtime,recipe){
  const surfaces=createKriegerSurfaceLibrary(runtime.renderer,recipe.seed),layout=canonicalCorridorLayout(recipe),profile=layout.profile;
  runtime.qualityObjects=runtime.qualityObjects||[];runtime.cinematicSurfaces=surfaces;runtime.canonicalLayout=layout;runtime.layoutSignature=canonicalLayoutSignature(recipe);
  runtime.scene.children.forEach(node=>{if(node.isHemisphereLight)node.intensity=.38;else if(node.isDirectionalLight)node.intensity=.28;});
  installRhythm(runtime,layout,surfaces);const localLights=installLocalLights(runtime,recipe);installHero(runtime,surfaces);
  runtime.scene.background=new THREE.Color(0x020407);runtime.scene.fog=new THREE.FogExp2(0x05080c,.045);
  runtime.renderer.toneMapping=THREE.ACESFilmicToneMapping;runtime.renderer.toneMappingExposure=1.38;
  return {profile,localLights,surfaces};
}
export function cinematicStackEvidence(runtime){
  const profile=runtime.cinematicArchitecture?.profile;
  const bg=runtime.scene.background instanceof THREE.Color?runtime.scene.background:new THREE.Color(1,1,1);
  const luminance=bg.r*.2126+bg.g*.7152+bg.b*.0722;
  return {
    architectureRhythm:Boolean(profile&&runtime.cinematicArchitecture.owned.length>=6),
    normalRoughness:Boolean(runtime.cinematicSurfaces?.stone?.normalMap&&runtime.cinematicSurfaces?.stone?.roughnessMap),
    localLights:runtime.cinematicLights?.filter(l=>l.isPointLight).length||0,
    heroForeground:Boolean(runtime.heroForeground?.children.length>=8),
    controlledDarkness:luminance<.08&&runtime.scene.fog?.isFogExp2===true,
    corridorSegments:profile?.segments||0
  };
}
export function disposeKriegerCinematicStack(runtime){
  for(const light of runtime.cinematicLights||[])runtime.scene.remove(light);
  if(runtime.heroForeground)runtime.camera.remove(runtime.heroForeground);if(runtime.heroKey)runtime.camera.remove(runtime.heroKey);
  for(const texture of runtime.cinematicSurfaces?.textures||[])texture.dispose?.();
}
