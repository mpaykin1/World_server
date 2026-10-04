import {THREE,createStandardBase,disposeRuntime} from './scene-builders.mjs';
import {sampleTimeline,createRng,clamp01,easeOutBack} from '../../shared/world-evolution-runtime.mjs';
import {semanticObjects} from '../../shared/trinity-scene-recipe.mjs';
import {canonicalCorridorLayout,CANONICAL_HERO,canonicalLightIntent,canonicalLayoutSignature} from '../../shared/trinity-canonical-layout.mjs';
import {hash32} from '../../shared/graphics/world-block-factory.mjs';

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
  if(runtime.localLight)runtime.scene.remove(runtime.localLight);disposeVoxelExtras(runtime);
  for(const child of [...runtime.root.children]){
    child.traverse(node=>{node.geometry?.dispose?.();if(Array.isArray(node.material))node.material.forEach(m=>m.dispose?.());else node.material?.dispose?.()});
    runtime.root.remove(child);
  }
  runtime.objects.clear();runtime.stageMaterials.clear();runtime.fragments=[];runtime.origin=null;runtime.localLight=null;runtime.voxelStats={corridorCubes:0,heroCubes:0,localLights:0};
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
function voxelMaterial(runtime,target,{roughness=.84,metalness=.02,emissive=null,emissiveIntensity=0}={}){
  const m=stageMaterial(target,roughness);m.metalness=metalness;
  if(emissive){m.emissive=new THREE.Color(emissive);m.emissiveIntensity=emissiveIntensity}
  runtime.stageMaterials.add(m);return m;
}
function addVoxelCloud(runtime,parent,cells,material,size=.34,{cast=false,seedOffset=0}={}){
  const geo=new THREE.BoxGeometry(size,size,size),inst=new THREE.InstancedMesh(geo,material,cells.length),d=new THREE.Object3D(),c=new THREE.Color();
  cells.forEach((p,i)=>{
    d.position.set(...p);d.updateMatrix();inst.setMatrixAt(i,d.matrix);
    const v=.78+(hash32(runtime.recipe.seed+seedOffset,i,cells.length)%100)/455;c.setRGB(v,v*.985,v*.955);inst.setColorAt(i,c);
  });
  inst.instanceMatrix.needsUpdate=true;if(inst.instanceColor)inst.instanceColor.needsUpdate=true;inst.castShadow=cast;inst.receiveShadow=true;parent.add(inst);return inst;
}
function floorVoxelCells(layout){
  const out=[],step=.46,{profile}=layout;
  const minZ=profile.startZ-1,maxZ=profile.startZ+profile.spacing*(profile.segments-.2);
  for(let x=-profile.halfWidth;x<=profile.halfWidth+.001;x+=step){
    for(let z=minZ;z<=maxZ+.001;z+=step)out.push([x,-.02,z]);
  }
  return out;
}
function columnVoxelCells(layout){
  const out=[],h=layout.profile.height*.72,levels=12;
  for(const e of layout.columns){
    for(let y=0;y<levels;y++)out.push([e.p[0],.22+(y+.5)*h/levels,e.p[2]]);
    for(const dx of [-.22,.22])for(const dz of [-.22,.22]){out.push([e.p[0]+dx,.18,e.p[2]+dz]);out.push([e.p[0]+dx,h+.24,e.p[2]+dz])}
  }
  return out;
}
function archVoxelCells(layout){
  const out=[],radius=layout.profile.halfWidth*.94;
  for(const e of layout.ribs){
    for(let i=0;i<=24;i++){
      const a=i*Math.PI/24;
      for(const dr of [-.13,.13]){
        const r=radius+dr;out.push([Math.cos(a)*r,e.p[1]+Math.sin(a)*r,e.p[2]]);
      }
    }
  }
  return out;
}
function panelVoxelCells(layout){
  const out=[];
  for(const e of layout.panels)for(const oy of [-.24,.24])for(const oz of [-.34,0,.34])out.push([e.p[0],e.p[1]+oy,e.p[2]+oz]);
  return out;
}
function fixtureVoxelCells(layout){
  const out=[];for(const e of layout.fixtures)for(const x of [-.20,0,.20])out.push([e.p[0]+x,e.p[1],e.p[2]]);return out;
}
function ensureVoxelCorridor(runtime){
  if(runtime.voxelCorridor)return runtime.voxelCorridor;
  const layout=canonicalCorridorLayout(runtime.recipe),g=new THREE.Group();g.name='canonical.voxel.corridor';runtime.scene.add(g);
  const floorMat=voxelMaterial(runtime,0x8f8171,{roughness:.90}),stone=voxelMaterial(runtime,0x71685f,{roughness:.86}),trim=voxelMaterial(runtime,0x9b6747,{roughness:.72,metalness:.05}),warm=voxelMaterial(runtime,0xe59a4e,{roughness:.42,emissive:0x8d3f12,emissiveIntensity:1.8});
  const floor=floorVoxelCells(layout),columns=columnVoxelCells(layout),arches=archVoxelCells(layout),panels=panelVoxelCells(layout),fixtures=fixtureVoxelCells(layout);
  addVoxelCloud(runtime,g,floor,floorMat,.42,{seedOffset:11});
  addVoxelCloud(runtime,g,columns,stone,.38,{cast:true,seedOffset:17});
  addVoxelCloud(runtime,g,arches,stone,.34,{cast:true,seedOffset:23});
  addVoxelCloud(runtime,g,panels,trim,.31,{seedOffset:31});
  addVoxelCloud(runtime,g,fixtures,warm,.28,{seedOffset:37});
  g.scale.setScalar(.001);runtime.voxelCorridor=g;runtime.canonicalLayout=layout;runtime.layoutSignature=canonicalLayoutSignature(runtime.recipe);
  runtime.voxelStats={corridorCubes:floor.length+columns.length+arches.length+panels.length+fixtures.length,heroCubes:0,localLights:0};
  return g;
}
function partBounds(part){
  if(part.shape==='box')return part.size;
  if(part.shape==='cylinder')return [Math.max(part.radiusTop,part.radiusBottom)*2,Math.max(part.radiusTop,part.radiusBottom)*2,part.height];
  return [part.radius*2+part.tube*2,part.radius*2+part.tube*2,part.tube*2];
}
function fillPartCells(size,step=.105){
  const [sx,sy,sz]=size,nx=Math.max(1,Math.min(6,Math.round(sx/step))),ny=Math.max(1,Math.min(6,Math.round(sy/step))),nz=Math.max(1,Math.min(12,Math.round(sz/step))),out=[];
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)out.push([(x/(Math.max(1,nx-1))-.5)*sx,(y/(Math.max(1,ny-1))-.5)*sy,(z/(Math.max(1,nz-1))-.5)*sz]);
  return out;
}
function ensureVoxelHero(runtime){
  if(runtime.voxelHero)return runtime.voxelHero;
  const t=CANONICAL_HERO.transform,hero=new THREE.Group();hero.name='hero.voxel-tool';hero.position.set(...t.position);hero.rotation.set(...t.rotation);hero.userData.baseScale=t.scale;
  const palette={
    metal:voxelMaterial(runtime,0x566675,{roughness:.36,metalness:.62}),
    darkStone:voxelMaterial(runtime,0x44515d,{roughness:.64,metalness:.10}),
    warmMetal:voxelMaterial(runtime,0xc28a61,{roughness:.42,metalness:.36}),
    emissive:voxelMaterial(runtime,0xffa85d,{roughness:.28,emissive:0xff6a18,emissiveIntensity:2.8})
  };
  let count=0;
  for(const part of CANONICAL_HERO.parts){
    const pg=new THREE.Group();pg.position.set(...part.p);pg.rotation.set(...(part.r||[0,0,0]));if(part.scale)pg.scale.set(...part.scale);hero.add(pg);
    const cells=fillPartCells(partBounds(part));count+=cells.length;addVoxelCloud(runtime,pg,cells,palette[part.material],.09,{cast:true,seedOffset:101+count});
  }
  runtime.camera.add(hero);if(!runtime.camera.parent)runtime.scene.add(runtime.camera);hero.scale.setScalar(.001);
  const key=new THREE.PointLight(0xc9ddf0,9.5,4.2,1.8);key.position.set(.05,.28,-.44);runtime.camera.add(key);
  runtime.voxelHero=hero;runtime.voxelHeroKey=key;runtime.voxelStats.heroCubes=count;return hero;
}
function ensureVoxelLights(runtime){
  if(runtime.voxelLights?.length)return;
  runtime.voxelLights=[];
  for(const [i,intent] of canonicalLightIntent(runtime.recipe).filter(x=>x.kind==='local').entries()){
    const light=new THREE.PointLight(intent.color,46,intent.radius,1.8);light.position.set(...intent.position);light.castShadow=i===0;runtime.scene.add(light);runtime.voxelLights.push(light);
  }
  runtime.voxelStats.localLights=runtime.voxelLights.length;
}
function disposeVoxelExtras(runtime){
  if(runtime.voxelHero){runtime.voxelHero.traverse(n=>{n.geometry?.dispose?.()});runtime.camera.remove(runtime.voxelHero)}
  if(runtime.voxelHeroKey)runtime.camera.remove(runtime.voxelHeroKey);
  if(runtime.voxelCorridor){runtime.voxelCorridor.traverse(n=>{n.geometry?.dispose?.()});runtime.scene.remove(runtime.voxelCorridor)}
  for(const light of runtime.voxelLights||[])runtime.scene.remove(light);
  runtime.voxelHero=null;runtime.voxelHeroKey=null;runtime.voxelCorridor=null;runtime.voxelLights=[];
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
  ensureVoxelCorridor(runtime);
}
function ensureLightingLife(runtime){
  const lamp=runtime.recipe.lights[0],character=runtime.recipe.characters[0];
  if(!runtime.objects.has(lamp.id))makeLamp(runtime,lamp);if(!runtime.objects.has(character.id))makeCharacter(runtime,character);
  ensureVoxelHero(runtime);ensureVoxelLights(runtime);
}
function updateGrowth(runtime,stages,time){
  const biome=stages.biome||0,arch=stages.architecture||0,life=stages.life||0,lighting=stages.lighting||0;
  for(const id of ['tree.courtyard','rock.west','rock.east'])runtime.objects.get(id)?.scale.setScalar(.02+biome*.98);
  const water=runtime.objects.get('water.rill');if(water)water.scale.y=.02+biome*.98;
  growInstances(runtime.objects.get('tower.main'),arch);growInstances(runtime.objects.get('bridge.arch'),arch);
  runtime.voxelCorridor?.scale.setScalar(.02+arch*.98);
  runtime.objects.get('light.lamp')?.scale.setScalar(.02+lighting*.98);runtime.objects.get('character.walker')?.scale.setScalar(.02+life*.98);
  if(runtime.voxelHero)runtime.voxelHero.scale.setScalar(runtime.voxelHero.userData.baseScale*(.02+lighting*.98));
  if(runtime.localLight)runtime.localLight.intensity=(runtime.recipe.lights[0].intensity||1.5)*lighting;
  for(const light of runtime.voxelLights||[])light.intensity=46*lighting;
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
  runtime.physicalObjectCount=0;
  for(const root of [runtime.root,runtime.voxelCorridor,runtime.voxelHero].filter(Boolean))root.traverse(n=>{if(n.isMesh||n.isInstancedMesh)runtime.physicalObjectCount+=n.isInstancedMesh?n.count:1});
}
export function createCubeRuntime(canvas,recipe){
  const runtime=createStandardBase(canvas,recipe,'CUBE');runtime.scene.background=new THREE.Color(0x090d13);runtime.scene.fog=new THREE.FogExp2(0x090d13,.032);
  runtime.renderer.toneMapping=THREE.ACESFilmicToneMapping;runtime.renderer.toneMappingExposure=1.34;runtime.stageMaterials=new Set();runtime.fragments=[];runtime.startedAt=performance.now();runtime.duration=recipe.evolution.durationMs;runtime.layoutSignature=canonicalLayoutSignature(recipe);
  runtime.restart=()=>{clearRoot(runtime);runtime.manualProgress=null;runtime.startedAt=performance.now();runtime.progress=0;runtime.stages={cube:1};installOrigin(runtime)};
  runtime.setProgress=(p,time=performance.now())=>{runtime.manualProgress=clamp01(p);applyProgress(runtime,runtime.manualProgress,time)};
  runtime.update=time=>{if(runtime.manualProgress===null)applyProgress(runtime,(time-runtime.startedAt)/runtime.duration,time)};
  runtime.dispose=()=>{disposeVoxelExtras(runtime);disposeRuntime(runtime)};runtime.restart();return runtime;
}
export function cubeSnapshot(runtime){
  return {progress:runtime.progress||0,physicalObjects:runtime.physicalObjectCount||0,semanticIds:[...runtime.objects.keys()].sort(),layoutSignature:runtime.layoutSignature||null,voxelArt:{...(runtime.voxelStats||{})},stages:{...(runtime.stages||{})},operations:{split:'REAL',move:'REAL',transform:'REAL',settle:'REAL',attach:'PARTIAL',extrude:'MISSING',merge:'MISSING'}};
}

export function cubeDeterministicSignature(recipe){
  let h=2166136261;const feed=v=>{for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}};
  feed(recipe.seed);feed(canonicalLayoutSignature(recipe));for(const p of terrainTargets(recipe,64))feed(p.toArray().map(v=>v.toFixed(3)).join(','));
  for(const o of semanticObjects(recipe)){feed(o.id);feed(o.kind);}
  return (h>>>0).toString(16).padStart(8,'0');
}
