import {THREE,createStandardBase,disposeRuntime} from './scene-builders.mjs';
import {sampleTimeline,createRng,clamp01,easeOutBack} from '../../shared/world-evolution-runtime.mjs';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';

const GREY=new THREE.Color(0x777a7d);
function stageMaterial(target,roughness=.82){
  const m=new THREE.MeshStandardMaterial({color:GREY.clone(),roughness,metalness:.03});
  m.userData.target=new THREE.Color(target);return m;
}
function cube(size,material,pos=[0,0,0]){
  const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;return m;
}
function groupFor(runtime,object){
  const g=new THREE.Group();g.name=object.id;g.userData.semanticId=object.id;g.userData.kind=object.kind;g.position.set(...(object.position||[0,0,0]));
  runtime.root.add(g);runtime.objects.set(object.id,g);return g;
}
function clearRoot(runtime){
  if(runtime.localLight)runtime.scene.remove(runtime.localLight);
  for(const child of [...runtime.root.children]){
    child.traverse(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.()});
    runtime.root.remove(child);
  }
  runtime.objects.clear();runtime.stageMaterials.clear();runtime.fragments=[];runtime.origin=null;runtime.localLight=null;
}
function installOrigin(runtime){
  const mat=stageMaterial(0x777777),origin=cube([1.45,1.45,1.45],mat,[0,.85,0]);
  origin.name='origin-cube';runtime.root.add(origin);runtime.origin=origin;runtime.physicalObjectCount=1;
}
function terrainTargets(recipe,count){
  const out=[],rng=createRng(recipe.seed),sx=recipe.terrain.size[0],sz=recipe.terrain.size[2];
  const cols=8,rows=Math.ceil(count/cols);
  for(let i=0;i<count;i++){
    const x=((i%cols)/(cols-1)-.5)*sx*.93,z=(Math.floor(i/cols)/(rows-1)-.5)*sz*.92;
    out.push(new THREE.Vector3(x,-.02+(rng()-.5)*.08,z));
  }
  return out;
}
function ensureMatter(runtime){
  if(runtime.fragments.length)return;
  const obj={id:'terrain.courtyard',kind:'terrain',position:runtime.recipe.terrain.position,size:runtime.recipe.terrain.size};
  const g=groupFor(runtime,obj),mat=stageMaterial(0x4b4a43);runtime.stageMaterials.add(mat);
  runtime.root.remove(runtime.origin);runtime.origin=null;
  const targets=terrainTargets(runtime.recipe,64);
  for(let i=0;i<64;i++){
    const f=cube([.42,.42,.42],mat,[0,.85,0]);f.userData.target=targets[i];f.userData.phase=i/63;g.add(f);runtime.fragments.push(f);
  }
  runtime.physicalObjectCount=64;
}
function updateMatter(runtime,matter,terrain){
  if(!runtime.fragments.length)return;
  for(const f of runtime.fragments){
    const spread=clamp01((matter-f.userData.phase*.18)/.82),settle=clamp01((terrain-f.userData.phase*.12)/.88);
    const target=f.userData.target,arc=Math.sin(spread*Math.PI)*(1.6+f.userData.phase);
    f.position.lerpVectors(new THREE.Vector3(0,.85,0),target,easeOutBack(spread));f.position.y+=arc*(1-settle);
    const sy=.42+(runtime.recipe.terrain.size[1]*1.25-.42)*settle;f.scale.y=Math.max(.25,sy/.42);
  }
}
function towerBlocks(runtime,o){
  const g=groupFor(runtime,o),mat=stageMaterial(0x79736b);runtime.stageMaterials.add(mat);
  const cells=[],sx=o.size[0],sy=o.size[1],sz=o.size[2],step=.55,nx=6,nz=6,ny=10;
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){
    const edge=x===0||x===nx-1||z===0||z===nz-1;if(!edge)continue;
    const door=z===0&&x>=2&&x<=3&&y<3;if(door)continue;
    cells.push([(x/(nx-1)-.5)*sx,(y+.5)/ny*sy,(z/(nz-1)-.5)*sz]);
  }
  const geo=new THREE.BoxGeometry(step,step,step),inst=new THREE.InstancedMesh(geo,mat,cells.length),d=new THREE.Object3D();
  cells.forEach((p,i)=>{d.position.set(...p);d.scale.setScalar(.001);d.updateMatrix();inst.setMatrixAt(i,d.matrix)});inst.userData.cells=cells;g.add(inst);return g;
}
function bridgeBlocks(runtime,o){
  const g=groupFor(runtime,o),mat=stageMaterial(0x9a876d),cells=[];runtime.stageMaterials.add(mat);
  for(let i=-5;i<=5;i++)cells.push([i*.43,1.16,0]);
  for(const x of [-1.85,1.85])for(let y=0;y<4;y++)cells.push([x,.22+y*.32,0]);
  for(let i=-5;i<=5;i++)if(Math.abs(i)>2)cells.push([i*.43,.70,0]);
  const geo=new THREE.BoxGeometry(.46,.34,.62),inst=new THREE.InstancedMesh(geo,mat,cells.length),d=new THREE.Object3D();
  cells.forEach((p,i)=>{d.position.set(...p);d.scale.setScalar(.001);d.updateMatrix();inst.setMatrixAt(i,d.matrix)});inst.userData.cells=cells;g.add(inst);return g;
}
function growInstances(group,amount){
  const inst=group?.children.find(x=>x.isInstancedMesh);if(!inst)return;
  const d=new THREE.Object3D(),cells=inst.userData.cells||[];
  cells.forEach((p,i)=>{const local=clamp01(amount-i/Math.max(1,cells.length)*.26);d.position.set(...p);d.scale.setScalar(.02+local*.98);d.updateMatrix();inst.setMatrixAt(i,d.matrix)});
  inst.instanceMatrix.needsUpdate=true;
}
function makeTree(runtime,o){
  const g=groupFor(runtime,o),bark=stageMaterial(0x4e3827),leaf=stageMaterial(0x526b4f);runtime.stageMaterials.add(bark);runtime.stageMaterials.add(leaf);
  g.add(cube([.42,2.35,.42],bark,[0,1.18,0]));
  for(let i=0;i<7;i++){const a=i*6.28/7,r=.56+(i%2)*.22;g.add(cube([.72,.72,.72],leaf,[Math.cos(a)*r,2.55+(i%3)*.3,Math.sin(a)*r]))}
  g.scale.setScalar(.001);return g;
}
function makeRock(runtime,o){
  const g=groupFor(runtime,o),mat=stageMaterial(0x595957),s=o.scale||.8;runtime.stageMaterials.add(mat);
  for(let i=0;i<3;i++){const b=cube([s*.72,s*.48,s*.68],mat,[(i-1)*s*.28,s*.25+i*.08,(i%2-.5)*s*.18]);b.rotation.set(i*.13,i*.42,i*.08);g.add(b)}
  g.scale.setScalar(.001);return g;
}
function makeWater(runtime,o){
  const g=groupFor(runtime,o),mat=stageMaterial(0x315f72,.3);mat.transparent=true;mat.opacity=.68;runtime.stageMaterials.add(mat);
  g.add(cube(o.size,mat,[0,.02,0]));g.scale.y=.001;return g;
}
function makeLamp(runtime,o){
  const g=groupFor(runtime,o),metal=stageMaterial(0x4c5054),warm=stageMaterial(0xe7a05b,.4);warm.emissive=new THREE.Color(0x7a3511);warm.emissiveIntensity=1.5;
  runtime.stageMaterials.add(metal);runtime.stageMaterials.add(warm);g.add(cube([.14,2.8,.14],metal,[0,1.4,0]));g.add(cube([.5,.24,.5],warm,[0,2.7,0]));g.scale.setScalar(.001);
  const light=new THREE.PointLight(o.color||0xffc77b,0,9,2);light.position.copy(g.position).add(new THREE.Vector3(0,2.7,0));runtime.scene.add(light);runtime.localLight=light;return g;
}
function makeCharacter(runtime,o){
  const g=groupFor(runtime,o),cloth=stageMaterial(0x435263),skin=stageMaterial(0xb89073),dark=stageMaterial(0x171b20);runtime.stageMaterials.add(cloth);runtime.stageMaterials.add(skin);runtime.stageMaterials.add(dark);
  g.add(cube([.46,.72,.28],cloth,[0,1.22,0]));g.add(cube([.28,.28,.28],skin,[0,1.76,0]));
  for(const x of [-.13,.13])g.add(cube([.15,.72,.18],dark,[x,.52,0]));
  for(const x of [-.34,.34])g.add(cube([.13,.66,.13],cloth,[x,1.2,0]));
  g.rotation.y=o.heading||0;g.scale.setScalar(.001);return g;
}
function ensureBiome(runtime){
  const all=semanticObjects(runtime.recipe);
  for(const o of all)if((o.kind==='tree'||o.kind==='rock'||o.kind==='water')&&!runtime.objects.has(o.id)){
    if(o.kind==='tree')makeTree(runtime,o);else if(o.kind==='water')makeWater(runtime,o);else makeRock(runtime,o);
  }
}
function ensureArchitecture(runtime){
  for(const o of runtime.recipe.architecture)if(!runtime.objects.has(o.id)){if(o.kind==='tower')towerBlocks(runtime,o);else bridgeBlocks(runtime,o)}
}
function ensureLightingLife(runtime){
  const lamp=runtime.recipe.lights[0],character=runtime.recipe.characters[0];
  if(!runtime.objects.has(lamp.id))makeLamp(runtime,lamp);if(!runtime.objects.has(character.id))makeCharacter(runtime,character);
}
function updateGrowth(runtime,stages,time){
  const biome=stages.biome||0,arch=stages.architecture||0,life=stages.life||0,lighting=stages.lighting||0;
  for(const id of ['tree.courtyard','rock.west','rock.east'])runtime.objects.get(id)?.scale.setScalar(.02+biome*.98);
  const water=runtime.objects.get('water.rill');if(water)water.scale.y=.02+biome*.98;
  growInstances(runtime.objects.get('tower.main'),arch);growInstances(runtime.objects.get('bridge.arch'),arch);
  runtime.objects.get('light.lamp')?.scale.setScalar(.02+lighting*.98);runtime.objects.get('character.walker')?.scale.setScalar(.02+life*.98);
  if(runtime.localLight)runtime.localLight.intensity=(runtime.recipe.lights[0].intensity||1.5)*lighting;
  const ch=runtime.objects.get('character.walker');if(ch&&life>.4)ch.rotation.y=(runtime.recipe.characters[0].heading||0)+Math.sin(time*.004)*.12;
}
function updateMaterials(runtime,amount){
  for(const m of runtime.stageMaterials)m.color.copy(GREY).lerp(m.userData.target||GREY,amount);
}
function applyProgress(runtime,p,time=performance.now()){
  const sample=sampleTimeline({timeline:runtime.recipe.evolution.stages},clamp01(p)),s=sample.stages;
  if((s.matter||0)>.01)ensureMatter(runtime);updateMatter(runtime,s.matter||0,s.terrain||0);
  if((s.biome||0)>.01)ensureBiome(runtime);if((s.architecture||0)>.01)ensureArchitecture(runtime);
  if((s.lighting||0)>.01||(s.life||0)>.01)ensureLightingLife(runtime);
  updateGrowth(runtime,s,time);updateMaterials(runtime,s.materials||0);runtime.progress=sample.progress;runtime.stages=s;
  runtime.physicalObjectCount=0;runtime.root.traverse(n=>{if(n.isMesh||n.isInstancedMesh)runtime.physicalObjectCount+=n.isInstancedMesh?n.count:1});
}
export function createCubeRuntime(canvas,recipe){
  const runtime=createStandardBase(canvas,recipe,'CUBE');runtime.scene.background=new THREE.Color(0x1b1f23);runtime.stageMaterials=new Set();runtime.fragments=[];runtime.startedAt=performance.now();runtime.duration=recipe.evolution.durationMs;
  runtime.restart=()=>{clearRoot(runtime);runtime.manualProgress=null;runtime.startedAt=performance.now();runtime.progress=0;runtime.stages={cube:1};installOrigin(runtime)};
  runtime.setProgress=p=>{runtime.manualProgress=clamp01(p);applyProgress(runtime,runtime.manualProgress,performance.now())};
  runtime.update=time=>{if(runtime.manualProgress===null)applyProgress(runtime,(time-runtime.startedAt)/runtime.duration,time)};
  runtime.dispose=()=>disposeRuntime(runtime);runtime.restart();return runtime;
}
export function cubeSnapshot(runtime){
  return {progress:runtime.progress||0,physicalObjects:runtime.physicalObjectCount||0,semanticIds:[...runtime.objects.keys()].sort(),stages:{...(runtime.stages||{})},operations:{split:'REAL',move:'REAL',transform:'REAL',settle:'REAL',attach:'PARTIAL',extrude:'MISSING',merge:'MISSING'}};
}

export function cubeDeterministicSignature(recipe){
  let h=2166136261;const feed=v=>{for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}};
  feed(recipe.seed);for(const p of terrainTargets(recipe,64))feed(p.toArray().map(v=>v.toFixed(3)).join(','));
  for(const o of semanticObjects(recipe)){feed(o.id);feed(o.kind);}
  return (h>>>0).toString(16).padStart(8,'0');
}
