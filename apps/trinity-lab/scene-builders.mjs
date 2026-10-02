import * as THREE from '../../shared/vendor/three-r160/three.module.min.js';
import {createNprContext, STYLE as INK_STYLE} from '../../shared/living-ink-webgl-npr.mjs';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';

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
  const g=new THREE.Group();g.name=object.id;g.userData.semanticId=object.id;g.userData.kind=object.kind;
  g.position.set(...(object.position||[0,0,0]));root.add(g);return g;
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
  const light=new THREE.PointLight(object.color||0xffc77b,object.intensity||1.5,9,2);light.position.copy(g.position).add(new THREE.Vector3(0,2.58,0));light.castShadow=true;scene.add(light);g.userData.localLight=light;return g;
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
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
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
  const {renderer,scene,camera,root,mats,objects}=runtime;
  for(const object of semanticObjects(recipe))objects.set(object.id,addStdObject(root,object,mats,scene,recipe.seed));
  runtime.update=time=>updateStandard(runtime,time);runtime.dispose=()=>disposeRuntime(runtime);return runtime;
}
function updateStandard(runtime,time){
  const ch=runtime.objects.get('character.walker'),t=time*.0042;if(ch?.userData.limbs){
    const swing=Math.sin(t)*.55;ch.userData.limbs.armL.rotation.x=swing;ch.userData.limbs.armR.rotation.x=-swing;
    ch.userData.limbs.legL.rotation.x=-swing*.55;ch.userData.limbs.legR.rotation.x=swing*.55;ch.rotation.y=.45+Math.sin(t*.12)*.08;
  }
  const water=runtime.objects.get('water.rill');if(water)water.position.y=Math.sin(time*.0014)*.025;
}
function inkGroup(root,object){
  const g=new THREE.Group();g.name=object.id;g.userData.semanticId=object.id;g.userData.kind=object.kind;g.position.set(...(object.position||[0,0,0]));root.add(g);return g;
}
function addInkTower(ctx,root,o){
  const g=inkGroup(root,o),s=o.size;ctx.box(g,s,[0,s[1]/2,0],{color:INK_STYLE.warm,opacity:.18,semantic:'tower',importance:1,edgeOpacity:.55});
  ctx.box(g,[s[0]+.28,.22,s[2]+.28],[0,s[1]-.55,0],{color:INK_STYLE.inkSoft,opacity:.10,semantic:'tower-trim',importance:.8,edgeOpacity:.48});
  for(let y=1.8;y<4.8;y+=1.25)ctx.box(g,[.36,.62,.06],[0,y,-s[2]/2-.035],{color:INK_STYLE.screen,opacity:.26,semantic:'window',importance:.85,edgeOpacity:.42});
  return g;
}
function addInkBridge(ctx,root,o){
  const g=inkGroup(root,o),w=o.size[0],d=o.size[2];ctx.box(g,[w,.26,d],[0,1.18,0],{color:INK_STYLE.warm,opacity:.17,semantic:'bridge',importance:1,edgeOpacity:.52});
  for(const x of [-w*.39,w*.39])ctx.box(g,[.62,1.18,d],[x,.58,0],{color:INK_STYLE.warm,opacity:.15,semantic:'bridge-pier',importance:.8,edgeOpacity:.48});
  const geo=new THREE.TorusGeometry(1.13,.22,8,28,Math.PI),arch=ctx.addInkMesh(g,geo,{color:INK_STYLE.warm,opacity:.13,semantic:'bridge-arch',importance:1,edgeOpacity:.58});arch.rotation.y=Math.PI/2;arch.position.set(0,.92,-d*.52);return g;
}
function addInkTree(ctx,root,o){
  const g=inkGroup(root,o),s=o.scale||1;ctx.cyl(g,.25*s,2.4*s,[0,1.2*s,0],{color:INK_STYLE.warm,opacity:.18,semantic:'tree-trunk',importance:.8,edgeOpacity:.38,segments:8});
  for(let i=0;i<6;i++){const a=i*6.28/6;const leaf=ctx.sphere(g,.72*s,[Math.cos(a)*.58*s,2.75*s+(i%2)*.32*s,Math.sin(a)*.58*s],{color:INK_STYLE.plant,opacity:.22,semantic:'tree',importance:.9,edgeOpacity:.34,w:8,h:6});leaf.scale.y=1.15}
  return g;
}
function addInkCharacter(ctx,root,o){
  const g=inkGroup(root,o);g.rotation.y=o.heading||0;ctx.box(g,[.46,.72,.26],[0,1.22,0],{color:INK_STYLE.suit[0],opacity:.22,semantic:'human-torso',importance:1,edgeOpacity:.55});
  ctx.sphere(g,.19,[0,1.78,0],{color:0xb99a82,opacity:.20,semantic:'human-head',importance:1,edgeOpacity:.42,w:10,h:7});
  const limbs=[];for(const x of [-.13,.13])limbs.push(ctx.box(g,[.15,.72,.17],[x,.52,0],{color:INK_STYLE.inkSoft,opacity:.17,semantic:'human-leg',importance:.8,edgeOpacity:.40}));
  for(const x of [-.34,.34])limbs.push(ctx.box(g,[.12,.66,.12],[x,1.20,0],{color:INK_STYLE.suit[0],opacity:.18,semantic:'human-arm',importance:.8,edgeOpacity:.40}));
  g.userData.limbs=limbs;return g;
}
function addInkSimple(ctx,root,o){
  const g=inkGroup(root,o);
  if(o.kind==='terrain'){ctx.box(g,o.size,[0,0,0],{color:0xeee8de,opacity:.14,semantic:'terrain',importance:.6,edgeOpacity:.12,edges:false});ctx.softPlane(g,[0,.28,0],15,12,.05,'wash',o.id.length);return g}
  if(o.kind==='lamp'){ctx.cyl(g,.07,2.8,[0,1.4,0],{color:INK_STYLE.inkSoft,opacity:.20,semantic:'lamp',importance:.85,edgeOpacity:.44,segments:8});ctx.sphere(g,.14,[0,2.58,0],{color:0xe8b06f,opacity:.26,semantic:'light',importance:1,edgeOpacity:.20,w:8,h:6});return g}
  if(o.kind==='water'){ctx.box(g,o.size,[0,.02,0],{color:0x86a9b8,opacity:.16,semantic:'water',importance:.75,edgeOpacity:.16});return g}
  ctx.sphere(g,o.scale||.8,[0,(o.scale||.8)*.55,0],{color:INK_STYLE.inkSoft,opacity:.18,semantic:'rock',importance:.65,edgeOpacity:.32,w:7,h:5});return g;
}
export function createInkRuntime(canvas,recipe){
  const ctx=createNprContext(canvas),root=new THREE.Group();ctx.scene.add(root);const objects=new Map();
  for(const object of semanticObjects(recipe)){
    let g;if(object.kind==='tower')g=addInkTower(ctx,root,object);else if(object.kind==='bridge')g=addInkBridge(ctx,root,object);
    else if(object.kind==='tree')g=addInkTree(ctx,root,object);else if(object.kind==='character')g=addInkCharacter(ctx,root,object);else g=addInkSimple(ctx,root,object);
    objects.set(object.id,g);
  }
  const runtime={kind:'INK',canvas,renderer:ctx.renderer,scene:ctx.scene,camera:ctx.camera,root,objects,recipe,ctx};
  runtime.resize=()=>ctx.resize();runtime.render=()=>ctx.render();runtime.update=time=>updateInk(runtime,time);runtime.dispose=()=>disposeRuntime(runtime);runtime.resize();return runtime;
}
function updateInk(runtime,time){
  const ch=runtime.objects.get('character.walker'),limbs=ch?.userData.limbs;if(limbs?.length===4){const s=Math.sin(time*.004)*.45;limbs[0].rotation.x=-s*.5;limbs[1].rotation.x=s*.5;limbs[2].rotation.x=s;limbs[3].rotation.x=-s}
  runtime.objects.get('tree.courtyard')?.rotation.set(0,Math.sin(time*.00025)*.035,0);
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

