import * as THREE from 'https://unpkg.com/three@0.165.0/build/three.module.js';
import {createEvolutionPlan,sampleTimeline,clamp01,easeOutBack,planSignature} from '../../shared/world-evolution-runtime.mjs';

const root=document.getElementById('game-root'),loading=document.getElementById('loading');
const stageEl=document.getElementById('stage'),fill=document.getElementById('fill'),replay=document.getElementById('replay');
const recipe=await fetch('./recipe.json',{cache:'no-store'}).then(r=>r.json());
const params=new URLSearchParams(location.search),autoplay=params.get('autoplay')!=='0';
const plan=createEvolutionPlan(recipe),duration=recipe.durationSeconds||12,mobile=matchMedia('(pointer:coarse)').matches;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x05070b);scene.fog=new THREE.Fog(0x05070b,7,24);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.05,80);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.65));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;root.append(renderer.domElement);
const hemi=new THREE.HemisphereLight(0x8aa8c4,0x1b1711,.35),sun=new THREE.DirectionalLight(0xffdfad,.15);sun.position.set(-6,9,4);sun.castShadow=true;sun.shadow.mapSize.set(mobile?512:1024,mobile?512:1024);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;scene.add(hemi,sun);
const world=new THREE.Group();scene.add(world);const box=new THREE.BoxGeometry(.68,.68,.68),smallBox=new THREE.BoxGeometry(.35,.35,.35);
const gray=new THREE.Color(0x777b80),earthColor=new THREE.Color(0x68513e),stoneColor=new THREE.Color(0x777a72),grassColor=new THREE.Color(0x64864a),woodColor=new THREE.Color(0x70482d),leafColor=new THREE.Color(0x496c3e),roofColor=new THREE.Color(0x3f4748);
const earth=new THREE.MeshStandardMaterial({color:gray,roughness:.96}),stone=new THREE.MeshStandardMaterial({color:gray,roughness:.9}),wood=new THREE.MeshStandardMaterial({color:gray,roughness:.88}),leaf=new THREE.MeshStandardMaterial({color:gray,roughness:.9}),roof=new THREE.MeshStandardMaterial({color:gray,roughness:.72,metalness:.08}),glass=new THREE.MeshStandardMaterial({color:0xbcecff,roughness:.18,metalness:.08,transparent:true,opacity:.7,emissive:0x000000});
const seedCube=new THREE.Mesh(new THREE.BoxGeometry(1.35,1.35,1.35),new THREE.MeshStandardMaterial({color:0x888c92,roughness:.9}));seedCube.position.y=1.25;seedCube.castShadow=true;world.add(seedCube);
const terrainMeshes=new Array(plan.terrain.length),rockMeshes=new Array(plan.biome.rocks.length),grassMeshes=new Array(plan.biome.grass.length),treeGroups=new Array(plan.biome.trees.length),archMeshes=new Array(plan.architecture.length);
let walker=null,birds=[],start=performance.now();
const cameraPath=new THREE.CatmullRomCurve3([new THREE.Vector3(0,2.8,11.5),new THREE.Vector3(8.2,4.8,8.4),new THREE.Vector3(9.5,6.4,1.8),new THREE.Vector3(5.7,5.2,-7),new THREE.Vector3(1.2,4.2,-10.2)]);
const look=new THREE.Vector3(0,1.1,0),tmpColor=new THREE.Color();
window.__WORLD_EVOLUTION_EVIDENCE__={ready:false,seed:plan.seed,signature:planSignature(plan),initialPrimitiveCount:1,progress:0,stage:'cube',visibilityPercent:0,visibleGeneratedObjects:0,seedCubeVisible:true,lifeActive:false,counts:{terrain:plan.terrain.length,rocks:plan.biome.rocks.length,grass:plan.biome.grass.length,trees:plan.biome.trees.length,architecture:plan.architecture.length}};

function ensureTerrain(i){
  if(terrainMeshes[i])return terrainMeshes[i];const m=new THREE.Mesh(box,earth);m.castShadow=false;m.receiveShadow=true;m.scale.setScalar(.06);m.position.copy(seedCube.position);world.add(m);terrainMeshes[i]=m;return m;
}
function ensureRock(i){
  if(rockMeshes[i])return rockMeshes[i];const d=plan.biome.rocks[i],g=new THREE.DodecahedronGeometry(d.s,0),m=new THREE.Mesh(g,stone);m.castShadow=true;m.receiveShadow=true;m.scale.setScalar(.02);m.position.set(d.x,d.y,d.z);world.add(m);rockMeshes[i]=m;return m;
}
function ensureGrass(i){
  if(grassMeshes[i])return grassMeshes[i];const d=plan.biome.grass[i],g=new THREE.BoxGeometry(.06,d.s,.06),m=new THREE.Mesh(g,leaf);m.position.set(d.x,d.y+d.s*.5,d.z);m.scale.y=.02;m.userData.phase=d.phase;world.add(m);grassMeshes[i]=m;return m;
}
function makeTree(d){
  const group=new THREE.Group(),trunk=new THREE.Mesh(new THREE.BoxGeometry(.34,2.1,.34),wood);trunk.position.y=1.05;trunk.castShadow=true;group.add(trunk);
  for(const [x,y,z,s] of [[0,2.2,0,1.4],[.45,2.0,.1,.9],[-.4,2.05,-.2,.92],[.1,2.7,.05,.8]]){const crown=new THREE.Mesh(new THREE.BoxGeometry(s,s,s),leaf);crown.position.set(x,y,z);crown.castShadow=true;group.add(crown);}
  group.position.set(d.x,d.y,d.z);group.scale.setScalar(.01);world.add(group);return group;
}
function ensureTree(i){return treeGroups[i]||(treeGroups[i]=makeTree(plan.biome.trees[i]));}
function ensureArch(i){
  if(archMeshes[i])return archMeshes[i];const d=plan.architecture[i],mat=d.kind==='roof'?roof:d.kind==='glass'?glass:stone,m=new THREE.Mesh(smallBox,mat);m.castShadow=true;m.receiveShadow=true;m.scale.setScalar(.02);m.position.set(d.x,.05,d.z);world.add(m);archMeshes[i]=m;return m;
}
function ensureLife(){
  if(walker)return;walker=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.42,.75,.3),roof),head=new THREE.Mesh(new THREE.BoxGeometry(.34,.34,.34),new THREE.MeshStandardMaterial({color:0xc99b74,roughness:.9}));head.position.y=.58;walker.add(body,head);
  for(const x of [-.13,.13]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.12,.46,.14),stone);leg.position.set(x,-.55,0);leg.userData.leg=true;walker.add(leg);}walker.scale.setScalar(.7);world.add(walker);
  birds=plan.life.birds.map(()=>{const g=new THREE.Group();const b=new THREE.Mesh(new THREE.BoxGeometry(.18,.08,.32),stone);const w1=new THREE.Mesh(new THREE.BoxGeometry(.3,.035,.1),stone),w2=w1.clone();w1.position.x=-.22;w2.position.x=.22;g.add(b,w1,w2);world.add(g);return g;});
}
function mixMaterial(mat,target,t){tmpColor.copy(gray).lerp(target,clamp01(t));mat.color.copy(tmpColor);}
function updateMaterials(p){mixMaterial(earth,earthColor,p);mixMaterial(stone,stoneColor,p);mixMaterial(wood,woodColor,p);mixMaterial(leaf,leafColor,p);mixMaterial(roof,roofColor,p);glass.emissive.setRGB(.12*p,.22*p,.28*p);}
function updateTerrain(s,time){
  const matter=s.matter,settle=s.terrain;for(let i=0;i<plan.terrain.length;i++){const d=plan.terrain[i],local=clamp01((matter-d.delay*.45)/.72);if(local<=0){if(terrainMeshes[i])terrainMeshes[i].visible=false;continue;}const m=ensureTerrain(i),e=easeOutBack(local),spiral=(1-local)*2.4;m.visible=true;m.position.set(d.x*e+Math.sin(i*.71+time*2)*spiral*.15,1.25+(d.y-1.25)*e+Math.sin(local*Math.PI)*1.7,d.z*e+Math.cos(i*.53+time*2)*spiral*.15);m.rotation.set(d.spin*(1-local),d.spin*.6*(1-local),0);m.scale.set(.94,.94*(.72+d.scaleY*.42),.94);if(settle<.15)m.scale.multiplyScalar(.88+.12*local);}
  seedCube.visible=matter<.89;seedCube.scale.setScalar(Math.max(.001,1-matter*1.12));seedCube.rotation.y+=.006;
}
function updateBiome(s,time){
  const p=s.biome;for(let i=0;i<plan.biome.rocks.length;i++){const d=plan.biome.rocks[i],q=clamp01((p-d.delay*.45)/.55);if(q>0){const m=ensureRock(i);m.visible=true;m.scale.setScalar(easeOutBack(q));}else if(rockMeshes[i])rockMeshes[i].visible=false;}
  for(let i=0;i<plan.biome.grass.length;i++){const d=plan.biome.grass[i],q=clamp01((p-d.delay*.55)/.45);if(q>0){const m=ensureGrass(i);m.visible=true;m.scale.y=easeOutBack(q);m.rotation.z=Math.sin(time*1.8+d.phase)*.12*p;}else if(grassMeshes[i])grassMeshes[i].visible=false;}
  for(let i=0;i<plan.biome.trees.length;i++){const d=plan.biome.trees[i],q=clamp01((p-d.delay*.45)/.55);if(q>0){const g=ensureTree(i);g.visible=true;const grow=easeOutBack(q)*d.scale;g.scale.set(grow,grow*(.86+.14*q),grow);g.rotation.z=Math.sin(time*.8+i)*.015*p;}else if(treeGroups[i])treeGroups[i].visible=false;}
}
function updateArchitecture(s){
  const p=s.architecture;for(let i=0;i<plan.architecture.length;i++){const d=plan.architecture[i],q=clamp01((p-d.delay*.36)/.64);if(q<=0){if(archMeshes[i])archMeshes[i].visible=false;continue;}const m=ensureArch(i);m.visible=true;const e=easeOutBack(q);m.position.y=.05+(d.y-.05)*e;m.scale.setScalar(e);}
}
function updateLife(s,time){
  if(s.life<=.02){if(walker)walker.visible=false;for(const b of birds)b.visible=false;return;}ensureLife();walker.visible=true;for(const b of birds)b.visible=true;const q=s.life,r=plan.life.walker.radius,a=time*plan.life.walker.speed+plan.life.walker.phase;walker.position.set(Math.cos(a)*r,.92,Math.sin(a)*r);walker.rotation.y=-a;walker.children.filter(x=>x.userData.leg).forEach((leg,i)=>leg.rotation.x=Math.sin(time*6+(i?Math.PI:0))*.6*q);
  birds.forEach((g,i)=>{const d=plan.life.birds[i],a=time*d.speed+d.phase;g.position.set(Math.cos(a)*d.radius,d.height+Math.sin(a*2)*.25,Math.sin(a)*d.radius);g.rotation.y=-a;g.children[1].rotation.z=Math.sin(time*8+i)*.5;g.children[2].rotation.z=-Math.sin(time*8+i)*.5;g.scale.setScalar(q);});
}
function updateLighting(s){
  const p=s.lighting;scene.background.set(0x05070b).lerp(new THREE.Color(0x91b2c4),p*.9);scene.fog.color.copy(scene.background);scene.fog.near=7-p*2;scene.fog.far=24+p*12;sun.intensity=.15+p*3;hemi.intensity=.35+p*1.05;sun.position.set(-6+p*13,9+p*3,4-p*7);renderer.toneMappingExposure=.9+p*.35;
}
function updateCamera(progress,time){
  const cp=cameraPath.getPoint(clamp01(progress*.94));camera.position.copy(cp);look.set(.4+Math.sin(progress*Math.PI)*.8,1.15+progress*.45,-.2);camera.lookAt(look);camera.rotation.z=Math.sin(time*.45)*.004;
}
function stageName(stages){const order=['final','life','lighting','materials','architecture','biome','terrain','matter','cube'];return order.find(k=>stages[k]>.08)||'cube';}
function visibleGeneratedCount(){return[...terrainMeshes,...rockMeshes,...grassMeshes,...treeGroups,...archMeshes].filter(x=>x?.visible).length+(walker?.visible?1:0)+birds.filter(x=>x?.visible).length;}
function updateEvidence(progress,stage){
  const rect=renderer.domElement.getBoundingClientRect(),viewportArea=Math.max(1,innerWidth*innerHeight);
  Object.assign(window.__WORLD_EVOLUTION_EVIDENCE__,{ready:true,progress:Number(progress.toFixed(4)),stage,visibilityPercent:Number(Math.min(100,100*rect.width*rect.height/viewportArea).toFixed(2)),visibleGeneratedObjects:visibleGeneratedCount(),seedCubeVisible:seedCube.visible,lifeActive:Boolean(walker?.visible&&birds.some(x=>x.visible))});
}
function renderAt(progress,time){
  const sample=sampleTimeline(recipe,progress),s=sample.stages,stage=stageName(s);updateTerrain(s,time);updateBiome(s,time);updateArchitecture(s);updateMaterials(s.materials);updateLighting(s);updateLife(s,time);updateCamera(progress,time);stageEl.textContent=stage.toUpperCase();fill.style.width=`${(progress*100).toFixed(1)}%`;renderer.render(scene,camera);updateEvidence(progress,stage);
}
function frame(now){
  const elapsed=(now-start)/1000,progress=clamp01(elapsed/duration);renderAt(progress,elapsed);if(progress<1)requestAnimationFrame(frame);
}
function restart(){
  for(const obj of [...terrainMeshes,...rockMeshes,...grassMeshes,...treeGroups,...archMeshes])if(obj)world.remove(obj);if(walker)world.remove(walker);for(const b of birds)world.remove(b);terrainMeshes.fill(null);rockMeshes.fill(null);grassMeshes.fill(null);treeGroups.fill(null);archMeshes.fill(null);walker=null;birds=[];seedCube.visible=true;seedCube.scale.setScalar(1);start=performance.now();if(autoplay)requestAnimationFrame(frame);else renderAt(0,0);
}
function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize,{passive:true});replay.addEventListener('click',restart);renderer.domElement.addEventListener('dblclick',restart);window.__WORLD_EVOLUTION_CONTROL__={seek(progress){const p=clamp01(progress);renderAt(p,p*duration);return {...window.__WORLD_EVOLUTION_EVIDENCE__};},restart};loading.classList.add('hidden');if(autoplay)requestAnimationFrame(frame);else renderAt(0,0);
