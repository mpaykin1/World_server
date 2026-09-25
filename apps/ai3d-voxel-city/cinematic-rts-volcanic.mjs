/**
 * World Server / Fog Frontier: CPU-designed, GPU-instanced volcanic RTS map.
 * Reuses the existing THREE.Scene, camera and renderer. This is a visual-only
 * demo overlay: no fake game-state, movement, harvesting or collision claims.
 * Procedural geometry has bounded instance counts and no network dependencies.
 */
import {mountRtsSurfaceMaterials} from './cinematic-rts-materials.mjs';
import {mountIndustrialDetails} from './cinematic-rts-details.mjs';
const BUDGET=Object.freeze({
  low:{radius:9,step:12,crystals:18,units:9,cliffs:85,details:24},
  balanced:{radius:13,step:9,crystals:42,units:20,cliffs:170,details:58},
  high:{radius:16,step:7,crystals:62,units:27,cliffs:260,details:82},
  ultra:{radius:17,step:6.5,crystals:80,units:36,cliffs:320,details:112}
});
export function rtsBudget(tier='balanced'){return BUDGET[tier]||BUDGET.balanced;}
function random(seed){
  let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};
}
function river(x,z){
  // Two meandering lava channels leave a navigable central industrial plateau.
  return x < -70+Math.sin(z*.052)*10 ||
    x > 75+Math.sin(z*.041+1.8)*8 ||
    (z>65&&x<-27&&x>-78);
}
function zone(x,z){
  if(Math.abs(x)<37&&z>-34&&z<37)return 'industrial';
  if((x+47)**2+(z-34)**2<24**2)return 'industrial';
  if((x-49)**2+(z+25)**2<19**2)return 'industrial';
  return 'basalt';
}
export function buildVolcanicRtsLayout({tier='balanced',seed=20260925}={}){
  const budget=rtsBudget(tier),rand=random(seed),tiles=[],lava=[],cliffs=[],stripes=[];
  const span=budget.radius*budget.step;
  for(let zi=-budget.radius;zi<=budget.radius;zi++){
    for(let xi=-budget.radius;xi<=budget.radius;xi++){
      const x=xi*budget.step,z=zi*budget.step,hot=river(x,z);
      const tile={x,z,height:-2.5+(rand()-.5)*.23,
        style:hot?'lava':zone(x,z),variation:rand()};
      (hot?lava:tiles).push(tile);
      if(!hot){
        const adjacent=[[-1,0],[1,0],[0,-1],[0,1]];
        for(const [dx,dz] of adjacent){
          const nx=(xi+dx)*budget.step,nz=(zi+dz)*budget.step;
          if(river(nx,nz) || Math.abs(nx)>span||Math.abs(nz)>span){
            // A hard-looking basalt edge with dark cliff faces above the lava.
            if(cliffs.length<budget.cliffs){
              cliffs.push({x:x+dx*budget.step*.47,z:z+dz*budget.step*.47,
                height:2.9+rand()*4,rotation:rand()*6.283});
            }
          }
        }
        // Painted yellow/black hazard details on grid edges: shared material/geometry.
        if(tile.style==='industrial'&&rand()<.23&&stripes.length<budget.details){
          stripes.push({x:x+budget.step*.29,z:z-budget.step*.32,rotation:rand()<.5?0:1.57});
        }
      }
    }
  }
  const resources=[],clusters=[{x:50,z:-43},{x:-44,z:-53},{x:53,z:37}];
  const distribution=budget.crystals;
  for(let i=0;i<distribution;i++){
    const c=clusters[i%clusters.length],a=i*2.39996+rand()*.2;
    const r=3.0+Math.sqrt(i/distribution)*9+rand()*2;
    const x=c.x+Math.cos(a)*r,z=c.z+Math.sin(a)*r;
    if(!river(x,z))resources.push({x,z,size:1.1+rand()*1.85,
      yaw:rand()*6.283,glow:.68+rand()*.32});
  }
  const structures=[
    {kind:'command',x:-47,z:33,width:17,depth:16,height:8},
    {kind:'refinery',x:49,z:-26,width:16,depth:12,height:9},
    {kind:'factory',x:48,z:33,width:17,depth:13,height:7},
    {kind:'relay',x:-45,z:-23,width:11,depth:10,height:10},
    {kind:'turret',x:-35,z:-47,width:6,depth:6,height:11},
    {kind:'turret',x:33,z:45,width:6,depth:6,height:11}
  ];
  const units=[],paths=[{x:40,z:-24},{x:52,z:29},{x:-49,z:27},{x:-23,z:48}];
  for(let i=0;i<budget.units;i++){
    const p=paths[i%paths.length],a=rand()*6.283,r=3+rand()*7;
    units.push({x:p.x+Math.cos(a)*r,z:p.z+Math.sin(a)*r,
      yaw:rand()*6.283,variant:i%3,phase:rand()*6.283});
  }
  return {tier,seed,step:budget.step,span,tiles,lava,cliffs,stripes,resources,
    structures,units,visualOnly:true,collisionsIntegrated:false};
}
export function paintLavaPixels(size=256,seed=20260925){
  if(!Number.isInteger(size)||size<32||size>512)throw Error('lava texture CPU budget exceeded');
  const data=new Uint8ClampedArray(size*size*4);
  const hash=(x,y)=>{let v=(Math.imul(x,374761393)+Math.imul(y,668265263)+seed)|0;
    v=Math.imul(v^(v>>>13),1274126177);return((v^(v>>>16))>>>0)/4294967295;};
  const smooth=t=>t*t*(3-2*t);
  const noise=(x,y)=>{
    const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);
    const a=hash(i,j)+(hash(i+1,j)-hash(i,j))*u;
    const b=hash(i,j+1)+(hash(i+1,j+1)-hash(i,j+1))*u;
    return a+(b-a)*v;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/size,v=y/size;
    const flow=noise(u*7.4,v*6.1),veins=noise(u*30,v*26);
    const wave=Math.abs(Math.sin((u*18+flow*4)*2+Math.cos(v*11)*2.1));
    const hot=Math.max(0,Math.min(1,(flow*.6+veins*.17+wave*.25-.31)*1.7));
    const crust=flow<.38&&veins<.54,glow=crust?.20:hot;
    const i=(y*size+x)*4;
    data[i]=110+glow*145;
    data[i+1]=13+glow*201;
    data[i+2]=2+Math.pow(glow,2)*52;
    data[i+3]=255;
  }
  return {pixels:data,size,seed};
}
function instance(THREE,parent,geometry,material,data,transform,colormap){
  if(!data.length)return null;
  const obj=new THREE.InstancedMesh(geometry,material,data.length);
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  for(let i=0;i<data.length;i++){
    transform(dummy,data[i],i);dummy.updateMatrix();obj.setMatrixAt(i,dummy.matrix);
    if(colormap){color.setHex(colormap(data[i],i));obj.setColorAt(i,color);}
  }
  obj.instanceMatrix.needsUpdate=true;
  if(obj.instanceColor)obj.instanceColor.needsUpdate=true;
  obj.castShadow=false;obj.receiveShadow=false;obj.frustumCulled=true;
  parent.add(obj);return obj;
}
export function mountVolcanicRtsMap(THREE,parent,{tier='balanced',seed=20260925}={}){
  if(!THREE?.InstancedMesh||!parent?.add)throw Error('existing THREE renderer required');
  const layout=buildVolcanicRtsLayout({tier,seed});
  const group=new THREE.Group();group.name='RTSVolcanicTacticalStageVisualOnly';
  group.userData={visualOnly:true,gameStateLinked:false,collisionIntegrated:false};
  parent.add(group);
  const geometries=[],materials=[],register=(geo,mat)=>{
    if(geo)geometries.push(geo);if(mat)materials.push(mat);return[geo,mat];
  };
  const box=register(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({
    color:0xffffff,roughness:.89,metalness:.09,vertexColors:false}));
  const steel=register(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({
    color:0x4a525b,roughness:.48,metalness:.57}));
  // One deterministic CPU-painted 256x256 magma texture covers the whole map.
  // Basalt/metal terrain hides it everywhere except actual lava river gaps.
  const lavaPixels=paintLavaPixels(256,seed);
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=lavaPixels.size;
  const canvasCtx=canvas.getContext('2d');
  const bitmap=canvasCtx.createImageData(lavaPixels.size,lavaPixels.size);
  bitmap.data.set(lavaPixels.pixels);canvasCtx.putImageData(bitmap,0,0);
  const lavaTexture=new THREE.CanvasTexture(canvas);
  lavaTexture.colorSpace=THREE.SRGBColorSpace;
  lavaTexture.magFilter=THREE.LinearFilter;
  const lavaGeo=new THREE.PlaneGeometry(layout.span*2+layout.step,
    layout.span*2+layout.step);
  const lavaMat=new THREE.MeshBasicMaterial({map:lavaTexture,color:0xffffff,
    side:THREE.DoubleSide,toneMapped:false,fog:true});
  register(lavaGeo,lavaMat);
  // Offline-style PBR maps are painted on CPU once. Two shared draw calls
  // keep metal tile normals/ORM independent from the cracked basalt surface.
  const surfaces=mountRtsSurfaceMaterials(THREE,tier,seed);
  box[0].setAttribute('uv2',box[0].attributes.uv);
  const tileTransform=(o,t)=>{o.position.set(t.x,t.height,t.z);
    o.scale.set(layout.step*.985,.9,layout.step*.985);o.rotation.set(0,0,0);};
  const industry=layout.tiles.filter(t=>t.style==='industrial');
  const basalt=layout.tiles.filter(t=>t.style==='basalt');
  const metalTiles=instance(THREE,group,box[0],surfaces.industrial,industry,tileTransform);
  const basaltTiles=instance(THREE,group,box[0],surfaces.basalt,basalt,tileTransform);
  if(metalTiles)metalTiles.name='InstancedIndustrialPbrTiles';
  if(basaltTiles)basaltTiles.name='InstancedCrackedBasaltPbrTiles';
  const hot=new THREE.Mesh(lavaGeo,lavaMat);
  hot.rotation.x=-Math.PI/2;
  hot.position.y=-5.9;
  hot.name='ProceduralCpuPaintedLavaRivers';
  group.add(hot);
  const rockMaterial=new THREE.MeshStandardMaterial({color:0x262125,roughness:1,
    metalness:0,flatShading:true});
  const rockGeo=new THREE.IcosahedronGeometry(1,0);
  register(rockGeo,rockMaterial);
  const cliffs=instance(THREE,group,rockGeo,rockMaterial,layout.cliffs,
    (o,c)=>{o.position.set(c.x,-3.2,c.z);
      o.rotation.set(c.rotation*.17,c.rotation,.15);
      o.scale.set(layout.step*.48,c.height*.6,layout.step*.44);});
  cliffs.name='InstancedBasaltCliffEdges';
  const lineMaterial=new THREE.MeshBasicMaterial({color:0xe7a133,toneMapped:false,fog:true});
  const lineGeo=new THREE.BoxGeometry(1,1,1);register(lineGeo,lineMaterial);
  const caution=instance(THREE,group,lineGeo,lineMaterial,layout.stripes,
    (o,s)=>{o.position.set(s.x,-1.94,s.z);o.scale.set(layout.step*.36,.034,.16);
      o.rotation.set(0,s.rotation,0);});
  if(caution)caution.name='InstancedTacticalHazardMarkings';
  const crystalGeo=new THREE.ConeGeometry(1,3.5,5);
  const crystalMat=new THREE.MeshStandardMaterial({color:0x63baff,emissive:0x146aff,
    emissiveIntensity:1.7,roughness:.21,metalness:.24,flatShading:true});
  register(crystalGeo,crystalMat);
  const crystals=instance(THREE,group,crystalGeo,crystalMat,layout.resources,
    (o,c)=>{o.position.set(c.x,-.15+c.size*.28,c.z);
      o.rotation.set(.09,c.yaw,.11);o.scale.set(c.size*.62,c.size,c.size*.55);});
  crystals.name='InstancedBlueResourceCrystals';
  // Industrial modules use only a few shared meshes, including roof accents.
  const buildingData=layout.structures.filter(s=>s.kind!=='turret');
  const buildingMain=instance(THREE,group,steel[0],steel[1],buildingData,
    (o,s)=>{o.position.set(s.x,s.height*.49-1.85,s.z);
      o.rotation.set(0,0,0);o.scale.set(s.width,s.height,s.depth);});
  buildingMain.name='InstancedModularRTSIndustrialModules';
  const roofMat=new THREE.MeshStandardMaterial({color:0x2b343f,roughness:.63,metalness:.5});
  const roofGeo=new THREE.BoxGeometry(1,1,1);register(roofGeo,roofMat);
  const roofs=instance(THREE,group,roofGeo,roofMat,buildingData,
    (o,s)=>{o.position.set(s.x,s.height-1.7,s.z);
      o.rotation.set(0,0,0);o.scale.set(s.width*1.06,.48,s.depth*1.07);});
  roofs.name='IndustrialRoofs';
  const beaconsMat=new THREE.MeshBasicMaterial({color:0xff641d,toneMapped:false});
  const beaconsGeo=new THREE.BoxGeometry(1,1,1);register(beaconsGeo,beaconsMat);
  const lights=instance(THREE,group,beaconsGeo,beaconsMat,layout.structures,
    (o,s)=>{o.position.set(s.x,s.height-1.2,s.z);
      o.rotation.set(0,0,0);o.scale.set(s.kind==='turret'?.95:1.5,.35,1.6);});
  lights.name='InstancedRTSWarmWarningLights';
  const turrets=layout.structures.filter(s=>s.kind==='turret');
  const turretGeo=new THREE.CylinderGeometry(1.25,2.0,6,8);
  const turretMat=new THREE.MeshStandardMaterial({color:0x485059,metalness:.66,roughness:.52});
  register(turretGeo,turretMat);
  const guns=instance(THREE,group,turretGeo,turretMat,turrets,
    (o,s)=>{o.position.set(s.x,1.2,s.z);o.scale.set(1,1,1);});
  guns.name='InstancedDefensiveTurrets';
  const droneGeo=new THREE.OctahedronGeometry(.8,0);
  const droneMat=new THREE.MeshStandardMaterial({color:0xb4b9c3,metalness:.67,
    roughness:.39,emissive:0x295275,emissiveIntensity:.24});
  register(droneGeo,droneMat);
  const unitObjects=instance(THREE,group,droneGeo,droneMat,layout.units,
    (o,u)=>{o.position.set(u.x,0,u.z);o.rotation.set(0,u.yaw,0);o.scale.set(1.25,.8,1.7);});
  unitObjects.name='InstancedRTSScaleScoutDrones';
  // One batch per microdetail type, rather than a separate GPU draw per window.
  const windows=[];
  for(const s of buildingData){
    for(let row=0;row<2;row++)for(let col=0;col<5;col++){
      const y=1.8+row*2.25;
      windows.push({x:s.x-s.width*.37+col*s.width*.185,y,
        z:s.z+s.depth*.502,side:0});
      windows.push({x:s.x+s.width*.503,y,
        z:s.z-s.depth*.32+col*s.depth*.16,side:1});
    }
  }
  const windowGeo=new THREE.BoxGeometry(1,1,1);
  const windowMat=new THREE.MeshBasicMaterial({color:0xffc18a,toneMapped:false,fog:true});
  register(windowGeo,windowMat);
  const glowingWindows=instance(THREE,group,windowGeo,windowMat,windows,
    (o,v)=>{o.position.set(v.x,v.y,v.z);
      o.rotation.set(0,0,0);o.scale.set(v.side?.08:1.3,1.13,v.side?1.1:.08);});
  glowingWindows.name='InstancedWarmIndustrialWindows';
  const roofFixtures=buildingData.flatMap(s=>[0,1,2].map((_,i)=>({
    x:s.x-s.width*.31+i*s.width*.3,z:s.z-s.depth*.18+(i%2)*s.depth*.36,
    y:s.height-1.15})));
  const fixtures=instance(THREE,group,roofGeo,roofMat,roofFixtures,
    (o,p)=>{o.position.set(p.x,p.y,p.z);o.scale.set(2,1.5,1.35);
      o.rotation.set(0,0,0);});
  fixtures.name='InstancedRoofMechanicalCabinets';
  const pipeGeo=new THREE.CylinderGeometry(.24,.24,1,8);
  const pipeMat=new THREE.MeshStandardMaterial({color:0x7a838d,
    metalness:.71,roughness:.48});
  register(pipeGeo,pipeMat);
  const conduitPositions=buildingData.flatMap(s=>[0,1,2].map((_,i)=>({
    x:s.x-s.width*.32+i*s.width*.34,z:s.z+s.depth*.63,y:.22})));
  const conduits=instance(THREE,group,pipeGeo,pipeMat,conduitPositions,
    (o,p)=>{o.position.set(p.x,p.y,p.z);
      o.rotation.set(0,0,Math.PI/2);o.scale.set(1,2.9,1);});
  conduits.name='InstancedRTSIndustrialConduitPipes';
  const details=mountIndustrialDetails(THREE,group,layout,tier);
  let lastUpdate=-Infinity;
  const dummy=new THREE.Object3D();
  return {
    group,layout,
    update(now){
      // Throttled deterministic idle movement, not gameplay or user input.
      if(now-lastUpdate<115)return;lastUpdate=now;
      const t=now*.00042;
      for(let i=0;i<layout.units.length;i++){
        const u=layout.units[i],a=t+u.phase;
        dummy.position.set(u.x+Math.sin(a)*.55,.11+Math.sin(a*2)*.13,
          u.z+Math.cos(a)*.55);
        dummy.rotation.set(0,u.yaw+a*.12,0);dummy.scale.set(1.25,.8,1.7);
        dummy.updateMatrix();unitObjects.setMatrixAt(i,dummy.matrix);
      }
      unitObjects.instanceMatrix.needsUpdate=true;
      // Animate only one lava material; no expensive per-instance CPU write.
      lavaMat.color.setRGB(1,.96+Math.sin(t*.62)*.035,.96);
    },
    stats(){return{
      tier,tiles:layout.tiles.length,lavaTiles:layout.lava.length,
      cliffInstances:layout.cliffs.length,resourceCrystals:layout.resources.length,
      structures:layout.structures.length,animatedScoutDrones:layout.units.length,
      hazardDecals:layout.stripes.length,detailWindows:windows.length,
      terrainMaterialBytes:surfaces.textureBytes,details:details.stats(),
      roofFixtures:roofFixtures.length,industrialPipes:conduitPositions.length,
      instanceDrawCallsUpperBound:14+details.stats().batches,
      actualDrawCallsNeedBrowserMeasurement:true,visualOnly:true,
      authoritativeGameState:false,collisionIntegrated:false};},
    dispose(){group.parent?.remove(group);
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
      lavaTexture.dispose();surfaces.dispose();details.dispose();}
  };
}
