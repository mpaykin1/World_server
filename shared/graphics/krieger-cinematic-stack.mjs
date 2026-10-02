import * as THREE from '../vendor/three-r160/three.module.min.js';

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
function corridorMatrices(profile){
  const floor=[],walls=[],columns=[],caps=[],ribs=[],panels=[],fixtures=[];
  const {segments,spacing,halfWidth,height,startZ}=profile;
  for(let i=0;i<segments;i++){
    const z=startZ+i*spacing;
    for(let x=-halfWidth+1;x<=halfWidth-1;x+=1.7)floor.push({p:[x,-.12,z],s:[1.55,.12,spacing*.92]});
    for(const side of [-1,1]){
      const sx=side*(halfWidth+.62);walls.push({p:[sx,height*.48,z],s:[.48,height*.96,spacing*.94]});
      columns.push({p:[side*halfWidth,height*.42,z],s:[1,1,1]});caps.push({p:[side*halfWidth,height*.82,z],s:[1,1,1]});
      for(let row=0;row<3;row++)panels.push({p:[side*(halfWidth+.36),1.0+row*1.05,z],s:[.12,.62,spacing*.55]});
    }
    ribs.push({p:[0,height*.82,z],s:[1,1,1]});
    if(i%2===0)fixtures.push({p:[0,height*.92,z+.15],s:[1,1,1]});
  }
  return {floor,walls,columns,caps,ribs,panels,fixtures};
}
function installRhythm(runtime,profile,surfaces){
  const g=new THREE.Group();g.name='krieger.cinematic.architecture';runtime.scene.add(g);
  const m=corridorMatrices(profile),owned=[];
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
function installLocalLights(runtime,profile){
  const lights=[],z0=profile.startZ+profile.spacing*.8;
  for(let i=0;i<5;i++){
    const z=z0+i*profile.spacing*2.15,side=i%2===0?-1:1,light=new THREE.PointLight(0xffa04e,62,14,1.75);
    light.position.set(side*profile.halfWidth*.62,profile.height*.62,z);light.castShadow=false;
    runtime.scene.add(light);lights.push(light);
  }
  const cool=new THREE.DirectionalLight(0x86a9cf,.88);cool.position.set(-4,8,-6);cool.castShadow=false;runtime.scene.add(cool);
  runtime.cinematicLights=[...lights,cool];return lights;
}
function heroPart(group,geometry,material,p,r=[0,0,0]){
  const m=new THREE.Mesh(geometry,material);m.position.fromArray(p);m.rotation.set(...r);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
}
function installHero(runtime,surfaces){
  const hero=new THREE.Group();hero.name='hero.world-tool';hero.position.set(.24,-.43,-1.06);hero.rotation.set(-.055,-.16,.018);hero.scale.setScalar(.44);
  heroPart(hero,new THREE.BoxGeometry(.52,.25,.88),surfaces.metal,[0,.01,-.08]);
  heroPart(hero,new THREE.BoxGeometry(.58,.29,.34),surfaces.metal,[0,-.02,.50]);
  heroPart(hero,new THREE.BoxGeometry(.39,.105,.72),surfaces.warmMetal,[0,.19,-.20]);
  heroPart(hero,new THREE.CylinderGeometry(.078,.095,1.42,14),surfaces.metal,[0,.055,-1.07],[Math.PI/2,0,0]);
  heroPart(hero,new THREE.CylinderGeometry(.12,.14,.34,14),surfaces.warmMetal,[0,.055,-1.82],[Math.PI/2,0,0]);
  for(const x of [-.15,.15])heroPart(hero,new THREE.CylinderGeometry(.032,.042,1.08,10),surfaces.warmMetal,[x,.105,-.82],[Math.PI/2,0,0]);
  const grip=heroPart(hero,new THREE.BoxGeometry(.17,.60,.22),surfaces.darkStone,[0,-.40,.28],[-.31,0,0]);grip.scale.z=.76;
  for(let i=0;i<7;i++)heroPart(hero,new THREE.BoxGeometry(.40,.030,.055),surfaces.darkStone,[0,.245,-.43+i*.115]);
  for(let i=0;i<4;i++)heroPart(hero,new THREE.BoxGeometry(.040,.085,.13),surfaces.warmMetal,[.29,.025,-.40+i*.20]);
  heroPart(hero,new THREE.BoxGeometry(.050,.050,.34),surfaces.emissive,[.245,.19,-.40]);
  const ring=heroPart(hero,new THREE.TorusGeometry(.145,.030,8,20),surfaces.warmMetal,[0,.055,-2.01],[Math.PI/2,0,0]);ring.scale.y=.82;
  runtime.camera.add(hero);if(!runtime.camera.parent)runtime.scene.add(runtime.camera);
  const key=new THREE.PointLight(0xb9d4ef,11.5,4.5,1.7);key.position.set(.02,.30,-.50);runtime.camera.add(key);
  runtime.heroForeground=hero;runtime.heroKey=key;
  runtime.qualityObjects.push({id:'render.hero-world-tool',group:hero,kind:'hero-foreground',semanticLayers:['macro','meso','micro','surface','state','props'],semanticTags:['foreground','tool','receiver','barrel','rails','muzzle','indicator','grip'],materialVariation:.94,surfaceMicrodetail:.86,flatSurfaceRatio:.10,concavity:.62,functionalComponents:14,forceNearCamera:true});
  return hero;
}
export function cinematicProfileFromRecipe(recipe){
  const art=recipe.artDirection?.KRIEGER||{};
  return {
    segments:clamp(Number(art.corridorSegments)||14,8,24),
    spacing:clamp(Number(art.spacing)||2.8,2.2,4),
    halfWidth:clamp(Number(art.halfWidth)||3.45,2.8,5),
    height:clamp(Number(art.height)||5.0,4,7),
    startZ:Number.isFinite(Number(art.startZ))?Number(art.startZ):-6
  };
}
export function installKriegerCinematicStack(runtime,recipe){
  const surfaces=createKriegerSurfaceLibrary(runtime.renderer,recipe.seed),profile=cinematicProfileFromRecipe(recipe);
  runtime.qualityObjects=runtime.qualityObjects||[];runtime.cinematicSurfaces=surfaces;
  runtime.scene.children.forEach(node=>{if(node.isHemisphereLight)node.intensity=.38;else if(node.isDirectionalLight)node.intensity=.28;});
  installRhythm(runtime,profile,surfaces);const localLights=installLocalLights(runtime,profile);installHero(runtime,surfaces);
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
