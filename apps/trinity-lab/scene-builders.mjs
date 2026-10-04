import * as THREE from '../../shared/vendor/three-r160/three.module.min.js';
import {createLivingWatercolor3D,createWatercolorStyle} from '../../shared/graphics/living-watercolor-3d.js';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';
import {canonicalCorridorLayout,CANONICAL_HERO,canonicalLightIntent,canonicalLayoutSignature} from '../../shared/trinity-canonical-layout.mjs';
import {installKriegerCinematicStack,disposeKriegerCinematicStack} from '../../shared/graphics/krieger-cinematic-stack.mjs';

function shadowize(mesh){
  mesh.castShadow=true; mesh.receiveShadow=true; return mesh;
}
function mesh(geometry,material){
  return shadowize(new THREE.Mesh(geometry,material));
}
function box(size,material,pos=[0,0,0]){
  const m=mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);return m;
}
function stdMaterials(){
  return {
    ground:new THREE.MeshStandardMaterial({color:0x484841,roughness:.93,metalness:.02}),
    stone:new THREE.MeshStandardMaterial({color:0x77716a,roughness:.76,metalness:.04}),
    stone2:new THREE.MeshStandardMaterial({color:0x9a876d,roughness:.7,metalness:.03}),
    trim:new THREE.MeshStandardMaterial({color:0x4c5054,roughness:.58,metalness:.13}),
    dark:new THREE.MeshStandardMaterial({color:0x171b20,roughness:.3,metalness:.18}),
    warm:new THREE.MeshStandardMaterial({color:0xe7a05b,emissive:0x7a3511,emissiveIntensity:1.6,roughness:.35}),
    bark:new THREE.MeshStandardMaterial({color:0x4e3827,roughness:.9}),
    leaf:new THREE.MeshStandardMaterial({color:0x526b4f,roughness:.84}),
    cloth:new THREE.MeshStandardMaterial({color:0x435263,roughness:.7}),
    skin:new THREE.MeshStandardMaterial({color:0xb89073,roughness:.8}),
    water:new THREE.MeshPhysicalMaterial({color:0x315f72,roughness:.18,metalness:.02,transmission:.18,transparent:true,opacity:.72}),
    rock:new THREE.MeshStandardMaterial({color:0x595957,roughness:.96})
  };
}
function semanticGroup(root,object){
  const g=new THREE.Group(),position=object.position||[0,0,0];g.name=object.id;g.userData.semanticId=object.id;g.userData.kind=object.kind;g.userData.basePosition=[...position];
  g.position.set(...position);root.add(g);return g;
}
function addTower(root,object,m){
  const g=semanticGroup(root,object),s=object.size;
  g.add(box([s[0],s[1],s[2]],m.stone,[0,s[1]/2,0]));
  g.add(box([s[0]+.28,.22,s[2]+.28],m.trim,[0,s[1]-.55,0]));
  for(let x=-1.25;x<=1.25;x+=.83)g.add(box([.42,.38,.5],m.stone2,[x,s[1]+.18,-1.45]));
  for(let y=1.8;y<4.8;y+=1.25)g.add(box([.36,.62,.08],m.warm,[0,y,-s[2]/2-.045]));
  const door=box([.8,1.25,.12],m.dark,[0,.63,-s[2]/2-.07]);g.add(door);
  const arch=mesh(new THREE.TorusGeometry(.52,.12,7,22,Math.PI),m.trim);
  arch.position.set(0,1.25,-s[2]/2-.08);g.add(arch);
  return g;
}
function addBridge(root,object,m){
  const g=semanticGroup(root,object),w=object.size[0],d=object.size[2];
  g.add(box([w,.26,d],m.stone2,[0,1.18,0]));
  g.add(box([.62,1.18,d],[m.stone][0],[-w*.39,.58,0]));
  g.add(box([.62,1.18,d],m.stone,[w*.39,.58,0]));
  const arch=mesh(new THREE.TorusGeometry(1.13,.22,8,28,Math.PI),m.stone);
  arch.rotation.y=Math.PI/2;arch.position.set(0,.92,-d*.52);g.add(arch);
  for(const z of [-d*.44,d*.44])for(let x=-w*.45;x<=w*.45;x+=.55)g.add(box([.10,.42,.10],m.trim,[x,1.46,z]));
  return g;
}
function addTree(root,object,m){
  const g=semanticGroup(root,object),s=object.scale||1;
  const trunk=mesh(new THREE.CylinderGeometry(.22*s,.31*s,2.45*s,9),m.bark);trunk.position.y=1.2*s;g.add(trunk);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5,leaf=mesh(new THREE.IcosahedronGeometry((.72+(i%2)*.12)*s,1),m.leaf);
    leaf.position.set(Math.cos(a)*.62*s,2.65*s+(i%2)*.38*s,Math.sin(a)*.62*s);leaf.scale.y=1.2;g.add(leaf);
  }
  const crown=mesh(new THREE.IcosahedronGeometry(.92*s,1),m.leaf);crown.position.y=3.25*s;g.add(crown);return g;
}
function addCharacter(root,object,m){
  const g=semanticGroup(root,object);g.rotation.y=object.heading||0;
  const torso=box([.46,.72,.26],m.cloth,[0,1.22,0]),head=mesh(new THREE.SphereGeometry(.19,12,9),m.skin);head.position.y=1.78;
  const legL=box([.16,.72,.18],m.dark,[-.12,.52,0]),legR=box([.16,.72,.18],m.dark,[.12,.52,0]);
  const armL=box([.13,.68,.13],m.cloth,[-.34,1.2,0]),armR=box([.13,.68,.13],m.cloth,[.34,1.2,0]);
  armL.name='armL';armR.name='armR';legL.name='legL';legR.name='legR';
  g.add(torso,head,legL,legR,armL,armR);g.userData.limbs={armL,armR,legL,legR};return g;
}
function addLamp(root,object,m,scene){
  const g=semanticGroup(root,object),pole=mesh(new THREE.CylinderGeometry(.07,.09,2.8,10),m.trim);pole.position.y=1.4;g.add(pole);
  g.add(box([.52,.10,.34],m.trim,[0,2.78,0]));const bulb=mesh(new THREE.SphereGeometry(.13,10,8),m.warm);bulb.position.set(0,2.58,0);g.add(bulb);
  const light=new THREE.PointLight(object.color||0xffc77b,object.intensity||1.5,9,2);light.position.copy(g.position).add(new THREE.Vector3(0,2.58,0));light.castShadow=false;scene.add(light);g.userData.localLight=light;return g;
}
function addWater(root,object,m){
  const g=semanticGroup(root,object),surface=box(object.size,m.water,[0,.02,0]);surface.receiveShadow=true;surface.userData.water=true;g.add(surface);return g;
}
function addRock(root,object,m){
  const g=semanticGroup(root,object),r=mesh(new THREE.DodecahedronGeometry(object.scale||.8,0),m.rock);r.position.y=(object.scale||.8)*.52;r.scale.set(1,.62,1.25);r.rotation.set(.2,.45,.08);g.add(r);return g;
}
function addTerrain(root,object,m,seed){
  const g=semanticGroup(root,object);g.add(box(object.size,m.ground,[0,0,0]));
  const grassGeo=new THREE.ConeGeometry(.055,.35,4),grassMat=new THREE.MeshStandardMaterial({color:0x65755a,roughness:.9});
  const grass=new THREE.InstancedMesh(grassGeo,grassMat,58),dummy=new THREE.Object3D();
  let x=seed>>>0;const rand=()=>{x=(Math.imul(x^x>>>15,1|x)+0x6D2B79F5)|0;return((x^x>>>14)>>>0)/4294967296};
  for(let i=0;i<58;i++){const gx=(rand()-.5)*16,gz=(rand()-.5)*13;if(Math.abs(gx-2.3)<1.25){dummy.position.set(gx,.35,gz);dummy.scale.setScalar(.01)}else{dummy.position.set(gx,.13,gz);dummy.scale.setScalar(.7+rand()*.8)}dummy.rotation.y=rand()*6.28;dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix)}
  grass.castShadow=true;g.add(grass);return g;
}
function addStdObject(root,object,m,scene,seed){
  if(object.kind==='terrain')return addTerrain(root,object,m,seed);
  if(object.kind==='tower')return addTower(root,object,m);
  if(object.kind==='bridge')return addBridge(root,object,m);
  if(object.kind==='tree')return addTree(root,object,m);
  if(object.kind==='character')return addCharacter(root,object,m);
  if(object.kind==='lamp')return addLamp(root,object,m,scene);
  if(object.kind==='water')return addWater(root,object,m);
  return addRock(root,object,m);
}
function resizeStandard(runtime){
  const w=runtime.canvas.clientWidth||innerWidth,h=runtime.canvas.clientHeight||innerHeight,dpr=Math.min(devicePixelRatio||1,1.75);
  runtime.renderer.setPixelRatio(dpr);runtime.renderer.setSize(w,h,false);runtime.camera.aspect=w/h;runtime.camera.updateProjectionMatrix();
}
export function createStandardBase(canvas,recipe,kind='KRIEGER'){
  const capture=typeof location!=='undefined'&&new URLSearchParams(location.search).get('capture')==='1';
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:capture});
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x111820);scene.fog=new THREE.FogExp2(0x111820,.025);
  const camera=new THREE.PerspectiveCamera(58,1,.08,100),root=new THREE.Group();scene.add(root);
  scene.add(new THREE.HemisphereLight(0x9fb8cb,0x2b251f,1.2));
  const sun=new THREE.DirectionalLight(0xffdfb8,2.35);sun.position.set(-7,11,-5);sun.castShadow=true;scene.add(sun);
  const runtime={kind,canvas,renderer,scene,camera,root,objects:new Map(),recipe,mats:stdMaterials()};
  runtime.resize=()=>resizeStandard(runtime);runtime.render=()=>renderer.render(scene,camera);runtime.resize();return runtime;
}
export function createKriegerRuntime(canvas,recipe){
  const runtime=createStandardBase(canvas,recipe,'KRIEGER');
  const {renderer,scene,camera,root,mats,objects}=runtime,cinematic=installKriegerCinematicStack(runtime,recipe);
  Object.assign(mats,{ground:cinematic.surfaces.floorStone,stone:cinematic.surfaces.stone,stone2:cinematic.surfaces.stone,trim:cinematic.surfaces.warmMetal,dark:cinematic.surfaces.metal,warm:cinematic.surfaces.emissive,rock:cinematic.surfaces.darkStone});
  for(const object of semanticObjects(recipe))objects.set(object.id,addStdObject(root,object,mats,scene,recipe.seed));
  let shadowWarm=false;
  runtime.render=()=>{renderer.render(scene,camera);if(!shadowWarm){renderer.shadowMap.autoUpdate=false;shadowWarm=true}};
  runtime.update=time=>updateStandard(runtime,time);
  runtime.dispose=()=>{disposeRuntime(runtime);disposeKriegerCinematicStack(runtime)};return runtime;
}
function updateStandard(runtime,time){
  const ch=runtime.objects.get('character.walker'),t=time*.0042;if(ch?.userData.limbs){
    const swing=Math.sin(t)*.55;ch.userData.limbs.armL.rotation.x=swing;ch.userData.limbs.armR.rotation.x=-swing;
    ch.userData.limbs.legL.rotation.x=-swing*.55;ch.userData.limbs.legR.rotation.x=swing*.55;ch.rotation.y=.45+Math.sin(t*.12)*.08;
  }
  const water=runtime.objects.get('water.rill');if(water){const baseY=water.userData.basePosition?.[1]??0;water.position.y=baseY+Math.sin(time*.0014)*.025;}
}
function addLayoutInstances(parent,geometry,material,entries,{cast=false,receive=true}={}){
  const inst=new THREE.InstancedMesh(geometry,material,entries.length),dummy=new THREE.Object3D();
  entries.forEach((entry,i)=>{dummy.position.set(...entry.p);dummy.rotation.set(...(entry.r||[0,0,0]));dummy.scale.set(...(entry.s||[1,1,1]));dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix)});
  inst.instanceMatrix.needsUpdate=true;inst.castShadow=cast;inst.receiveShadow=receive;parent.add(inst);return inst;
}
function heroGeometry(part){
  if(part.shape==='box')return new THREE.BoxGeometry(...part.size);
  if(part.shape==='cylinder')return new THREE.CylinderGeometry(part.radiusTop,part.radiusBottom,part.height,part.segments);
  return new THREE.TorusGeometry(part.radius,part.tube,part.radialSegments,part.tubularSegments);
}
function installSharedCorridor(runtime,mats){
  const layout=canonicalCorridorLayout(runtime.recipe),p=layout.profile,g=new THREE.Group();g.name='canonical.corridor';runtime.scene.add(g);
  addLayoutInstances(g,new THREE.BoxGeometry(1,1,1),mats.ground,layout.floor);
  addLayoutInstances(g,new THREE.BoxGeometry(1,1,1),mats.stone,layout.walls);
  addLayoutInstances(g,new THREE.CylinderGeometry(.34,.48,p.height*.72,10),mats.stone2,layout.columns);
  addLayoutInstances(g,new THREE.BoxGeometry(.92,.24,.92),mats.trim,layout.caps);
  addLayoutInstances(g,new THREE.TorusGeometry(p.halfWidth*.94,.16,8,28,Math.PI),mats.stone2,layout.ribs);
  addLayoutInstances(g,new THREE.BoxGeometry(1,1,1),mats.trim,layout.panels);
  addLayoutInstances(g,new THREE.BoxGeometry(.58,.09,.28),mats.warm,layout.fixtures,{receive:false});
  runtime.canonicalLayout=layout;runtime.sharedArchitecture=g;return g;
}
function installSharedHero(runtime,mats){
  const hero=new THREE.Group(),t=CANONICAL_HERO.transform;hero.name='hero.world-tool';hero.position.set(...t.position);hero.rotation.set(...t.rotation);hero.scale.setScalar(t.scale);
  for(const part of CANONICAL_HERO.parts){
    const key=part.material==='metal'?'dark':part.material==='darkStone'?'stone':part.material==='warmMetal'?'trim':'warm';
    const node=mesh(heroGeometry(part),mats[key]);node.position.set(...part.p);node.rotation.set(...(part.r||[0,0,0]));if(part.scale)node.scale.set(...part.scale);hero.add(node);
  }
  runtime.camera.add(hero);if(!runtime.camera.parent)runtime.scene.add(runtime.camera);runtime.heroForeground=hero;return hero;
}
function inkifyBaseMaterials(mats){
  const colors={ground:0xd5dce0,stone:0xc5ced6,stone2:0xb9c5d0,trim:0x8b9bad,dark:0x66778a,warm:0xd8c5b4,bark:0x7d8992,leaf:0x909e9c,cloth:0x7d8998,skin:0xb7aaa1,water:0xb8cbd4,rock:0x8d98a3};
  for(const [key,hex] of Object.entries(colors)){const m=mats[key];if(!m)continue;m.color?.setHex(hex);m.roughness=.96;m.metalness=0;if(m.emissive){m.emissive.setHex(0);m.emissiveIntensity=0}}
}
function installInkSemanticLines(runtime){
  const layout=runtime.canonicalLayout,positions=[],push=(a,b)=>positions.push(...a,...b),r=layout.profile.halfWidth*.94;
  for(const e of layout.ribs)for(const dr of [-.13,.13])for(let i=0;i<28;i++){
    const a=i*Math.PI/28,b=(i+1)*Math.PI/28,rr=r+dr;
    push([e.p[0]+Math.cos(a)*rr,e.p[1]+Math.sin(a)*rr,e.p[2]],[e.p[0]+Math.cos(b)*rr,e.p[1]+Math.sin(b)*rr,e.p[2]]);
  }
  const h=layout.profile.height*.72;
  for(const e of layout.columns)for(const dx of [-.34,.34])push([e.p[0]+dx,.12,e.p[2]],[e.p[0]+dx,h+.34,e.p[2]]);
  for(const e of layout.floor){const z=e.p[2];push([-layout.profile.halfWidth,-.005,z],[layout.profile.halfWidth,-.005,z])}
  for(const x of [-layout.profile.halfWidth,-1.65,0,1.65,layout.profile.halfWidth])push([x,-.004,layout.profile.startZ-1],[x,-.004,layout.profile.startZ+layout.profile.spacing*(layout.profile.segments+.5)]);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mat=new THREE.LineBasicMaterial({color:0x52677f,transparent:true,opacity:.42,depthWrite:false});
  const lines=new THREE.LineSegments(geo,mat);lines.name='ink.semantic-lines';runtime.scene.add(lines);runtime.inkSemanticLines=lines;return lines;
}
function installInkObjectEdges(root,{color=0x52677f,opacity=.32}={}){
  const additions=[];
  root.traverse(node=>{
    if(!node.isMesh||node.isInstancedMesh||node.userData?.inkEdgeOverlay)return;
    node.userData.watercolorOutline=false;
    const edges=new THREE.EdgesGeometry(node.geometry,28),mat=new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false,depthTest:true});
    const lines=new THREE.LineSegments(edges,mat);lines.name='ink.object-edges';lines.renderOrder=(node.renderOrder||0)+2;lines.userData.inkEdgeOverlay=true;additions.push([node,lines]);
  });
  for(const [node,lines] of additions)node.add(lines);
  return additions.map(([,lines])=>lines);
}
function installInkLightIntent(runtime){
  runtime.scene.children.forEach(node=>{if(node.isHemisphereLight){node.color.set(0xffffff);node.groundColor.set(0xc9d0d8);node.intensity=2.4}else if(node.isDirectionalLight){node.color.set(0xffffff);node.intensity=.52}});
  const lights=[];
  for(const intent of canonicalLightIntent(runtime.recipe).filter(light=>light.kind==='local')){
    const light=new THREE.PointLight(intent.color,2.1,intent.radius,2);light.position.set(...intent.position);runtime.scene.add(light);lights.push(light);
  }
  runtime.styleLights=lights;
}
export function createInkRuntime(canvas,recipe){
  const runtime=createStandardBase(canvas,recipe,'INK'),{renderer,scene,camera,root,mats,objects}=runtime;
  renderer.shadowMap.enabled=false;renderer.toneMapping=THREE.NoToneMapping;renderer.toneMappingExposure=1;
  scene.background=new THREE.Color(0xf6f1e7);scene.fog=new THREE.FogExp2(0xf6f1e7,.018);inkifyBaseMaterials(mats);
  for(const object of semanticObjects(recipe))objects.set(object.id,addStdObject(root,object,mats,scene,recipe.seed));
  const architecture=installSharedCorridor(runtime,mats),hero=installSharedHero(runtime,mats);installInkLightIntent(runtime);
  for(const node of scene.children)if(node.isDirectionalLight)node.castShadow=false;
  scene.traverse(node=>{if(node.isMesh||node.isInstancedMesh){node.castShadow=false;node.receiveShadow=false}});
  architecture.traverse(node=>{if(node.isMesh||node.isInstancedMesh)node.userData.watercolorOutline=false});
  installInkObjectEdges(root,{opacity:.33});installInkObjectEdges(hero,{opacity:.43});installInkSemanticLines(runtime);
  const style=createWatercolorStyle({seed:recipe.seed,inkColor:'#516984',paperColor:'#f6f1e7',washColor:'#8e9dad',washOpacity:.70,washLayers:9,edgeWidth:.028,edgeJitter:.30,outlinePasses:1,granulation:.66,bleed:.36,shadowWash:.075,motion:.08,pigmentPooling:.43,paperGap:.23,paintedLight:.84});
  const watercolor=createLivingWatercolor3D({THREE,renderer,scene,camera,style});
  root.traverse(node=>{if(node.isMesh||node.isInstancedMesh)node.userData.watercolorOutline=false});
  hero.traverse(node=>{if(node.isMesh||node.isInstancedMesh)node.userData.watercolorOutline=false});
  watercolor.apply(root,{seed:recipe.seed});watercolor.apply(architecture,{seed:recipe.seed+101});watercolor.apply(hero,{seed:recipe.seed+211});
  watercolor.addGroundWash(root,{x:0,z:7,width:15,depth:13,opacity:.042,seed:recipe.seed+307});
  watercolor.attachCompositor({replaceSource:true});
  scene.background=watercolor.paperTexture||new THREE.Color(style.paperColor);
  runtime.watercolor=watercolor;runtime.layoutSignature=canonicalLayoutSignature(recipe);
  runtime.render=()=>{renderer.render(scene,camera);watercolor.present(performance.now())};
  runtime.update=time=>{updateStandard(runtime,time);watercolor.tick(time)};
  runtime.dispose=()=>{watercolor.dispose();for(const light of runtime.styleLights||[])scene.remove(light);disposeRuntime(runtime)};
  runtime.resize();return runtime;
}
function updateInk(runtime,time){
  const ch=runtime.objects.get('character.walker');if(ch?.userData.limbs){const s=Math.sin(time*.004)*.45;ch.userData.limbs.armL.rotation.x=s;ch.userData.limbs.armR.rotation.x=-s;ch.userData.limbs.legL.rotation.x=-s*.5;ch.userData.limbs.legR.rotation.x=s*.5}
}
export function disposeRuntime(runtime){
  if(!runtime)return;runtime.scene?.traverse(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.()});
  runtime.renderer?.dispose?.();
}
export function runtimeMetrics(runtime){
  let meshes=0,triangles=0,materials=new Set(),lights=0;
  runtime.scene.traverse(node=>{if(node.isMesh||node.isInstancedMesh){meshes++;const p=node.geometry?.index?.count||node.geometry?.attributes?.position?.count||0,count=node.isInstancedMesh?node.count:1;triangles+=Math.floor(p/3)*count;if(node.material)materials.add(node.material.uuid||node.material.id)}if(node.isLight)lights++});
  return {meshes,triangles,materials:materials.size,lights,drawCalls:runtime.renderer.info?.render?.calls||0,dpr:runtime.renderer.getPixelRatio?.()||devicePixelRatio||1};
}
export {THREE};

