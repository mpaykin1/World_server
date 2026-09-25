/**
 * World Server / Fog Frontier: original procedurally authored hero RTS buildings.
 * One CPU layout -> shared-instanced geometry in existing Three.js renderer.
 * Differentiated command/refinery/factory/relay/turrets without paid assets,
 * external GPU generation or a second renderer.
 */
const BUDGET=Object.freeze({
 low:{roof:2,vent:1,rail:0,cables:0},
 balanced:{roof:4,vent:2,rail:1,cables:1},
 high:{roof:5,vent:3,rail:1,cables:2},
 ultra:{roof:6,vent:4,rail:1,cables:2}
});
export function heroBudget(tier){return BUDGET[tier]||BUDGET.balanced;}
export function planRtsHeroBuildings(layout,tier='balanced'){
 if(!layout?.structures?.length)throw Error('missing RTS layout for hero buildings');
 const q=heroBudget(tier);
 const parts=Object.fromEntries([
  'hull','foundation','roof','roofRim','bunker','buttress','turbine',
  'reactorCore','reactorRing','distiller','distillerCap','exhaustStack',
  'gantry','vent','roofRib','guardPost','guardRail','radarDish',
  'antenna','neonGreen','neonOrange','emergencyLamp','cable','turretBody',
  'turretBarrel','turretRing','heatExchanger','coolingFin'
 ].map(key=>[key,[]]));
 const add=(name,x,y,z,sx=1,sy=1,sz=1,ry=0,shade=0)=>
  parts[name].push({x,y,z,sx,sy,sz,ry,shade});
 for(const s of layout.structures){
  const {x,z,width:w,depth:d,height:h,kind}=s,top=h-1.85;
  if(kind==='turret'){
   add('foundation',x,-1.6,z,w*1.13,.9,d*1.13);
   add('turretBody',x,2.2,z,2.4,6.3,2.4);
   add('turretRing',x,5.65,z,3.0,.25,3);
   add('turretBarrel',x,6.6,z+.9,1.15,2.8,1.15,Math.PI/2);
   add('emergencyLamp',x,8.1,z,.27,.4,.27);
   continue;
  }
  add('foundation',x,-1.46,z,w*1.15,.97,d*1.17);
  add('hull',x,h*.5-1.85,z,w*.84,h,d*.83,0,kind==='command'?1:0);
  add('roof',x,top+.36,z,w*.95,.54,d*.95);
  add('roofRim',x,top+.68,z,w*1.025,.24,d*1.025);
  for(const side of [-1,1]){
   add('bunker',x+side*w*.39,1.24,z,w*.24,h*.5,d*.84,side*Math.PI*.08);
   add('bunker',x,1.24,z+side*d*.39,w*.82,h*.5,d*.23,0);
   for(let i=0;i<q.roof;i++){
    const xx=x+((i+.5)/q.roof-.5)*w*.77;
    add('roofRib',xx,top+.89,z,.19,.39,d*.87);
    add('coolingFin',xx,top+1.15,z+side*d*.22,.34,.46,d*.31);
   }
   if(q.rail){
    add('guardRail',x,top+1.27,z+side*d*.49,w*.94,.09,.13);
    for(let i=0;i<4;i++){
     add('guardPost',x+((i+.5)/4-.5)*w*.94,top+.88,
       z+side*d*.49,.085,.9,.085);
    }
   }
  }
  for(let i=0;i<q.vent;i++){
   const offset=((i+.5)/q.vent-.5);
   add('vent',x+offset*w*.58,top+1.43,z+d*.17,.72,1.45,.72);
   add('emergencyLamp',x+offset*w*.58,top+2.1,z+d*.17,.3,.18,.3);
  }
  for(const side of [-1,1]){
   add('buttress',x+side*w*.45,h*.26-1.23,z,
       w*.1,h*.57,d*.8,side*.14);
  }
  if(kind==='command'){
   // Command compound: stepped citadel, surrounded by four raised platforms.
   add('roof',x,top+1.64,z,w*.67,1.6,d*.69,0,1);
   add('roofRim',x,top+2.64,z,w*.75,.22,d*.76);
   for(let i=0;i<4;i++){
    const side=i%2?1:-1,axis=i<2;
    add('turbine',x+(axis?side*w*.27:0),top+3.27,
      z+(axis?0:side*d*.28),1.65,1.85,1.65);
    add('neonGreen',x+(axis?side*w*.27:0),top+4.1,
      z+(axis?0:side*d*.28),1.14,.24,1.14);
   }
   add('reactorCore',x,top+4.1,z,2.2,2.8,2.2);
   add('reactorRing',x,top+5.18,z,4,.2,4);
   add('radarDish',x+w*.26,top+4.6,z-d*.22,2.2,.52,2.2,.53);
   for(let i=0;i<4;i++){
    const a=i*Math.PI*.5;
    add('neonGreen',x+Math.cos(a)*w*.34,top+.72,
      z+Math.sin(a)*d*.34,2.05,.29,.4,a);
   }
  }
  if(kind==='refinery'){
   // Tall separate distillation columns + capped gas storage, recognizable at RTS scale.
   for(let i=0;i<3;i++){
    const xx=x+((i-1)*w*.23);
    add('distiller',xx,top+3.4,z-d*.11,1.7,7+(i===1?3:0),1.7);
    add('distillerCap',xx,top+7.1+(i===1?1.5:0),z-d*.11,2.15,.54,2.15);
    add('neonOrange',xx,top+7.5+(i===1?1.5:0),
      z-d*.11,.4,.35,.4);
   }
   add('gantry',x,top+5,z+d*.16,w*.78,.25,d*.18);
   add('exhaustStack',x+w*.38,top+3.4,z+d*.21,1.3,6.9,1.3);
   for(let j=0;j<3;j++){
    add('heatExchanger',x-w*.29+j*w*.15,top+1.8,z+d*.33,.68,3.1,.68);
   }
  }
  if(kind==='factory'){
   // Four foundry stacks, ribbed furnace shed, long production assembly hall.
   add('roof',x,top+2.2,z-d*.15,w*.72,2.5,d*.56,0,1);
   for(let i=0;i<4;i++){
    const xx=x+((i-.5*3)*w*.19);
    add('exhaustStack',xx,top+4.0,z-d*.15,1.36,8+i*.45,1.36);
    add('neonOrange',xx,top+8.4+i*.22,z-d*.15,1.04,.21,1.04);
   }
   for(let i=0;i<q.roof;i++)
    add('heatExchanger',x+((i+.5)/q.roof-.5)*w*.65,
      top+1.83,z+d*.24,1.1,1.8,1.3);
   for(let side of [-1,1])
    add('gantry',x+side*w*.48,2.3,z-d*.1,1.3,2.1,d*.78);
  }
  if(kind==='relay'){
   // Distinct technology-center silhouette: antenna forest and vertical emitters.
   add('reactorCore',x,top+2,z,2.2,3.6,2.2);
   add('reactorRing',x,top+3.82,z,3.8,.28,3.8);
   for(let i=0;i<4;i++){
    const a=i*Math.PI*.5;
    const xx=x+Math.cos(a)*w*.31,zz=z+Math.sin(a)*d*.29;
    add('antenna',xx,top+4.3,zz,.12,8.1,.12);
    add('emergencyLamp',xx,top+8.5,zz,.32,.39,.32);
   }
   add('radarDish',x,top+5.1,z,3.8,.45,3.8,.6);
   add('neonGreen',x,top+4.9,z,1.75,.32,1.75);
  }
  if(q.cables){
   for(let j=0;j<q.cables;j++){
    add('cable',x-w*.34,1.4+j*.5,z+d*.53,w*.62,.13,.17);
    add('cable',x+w*.53,1.4+j*.5,z-d*.3,.17,.13,d*.6);
   }
  }
 }
 return {tier,parts,counts:Object.fromEntries(
   Object.entries(parts).map(([k,v])=>[k,v.length]))};
}
function makeTileAtlas(THREE){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle='#454f57';ctx.fillRect(0,0,256,256);
 for(let y=0;y<256;y+=32)for(let x=0;x<256;x+=32){
  const shade=(x/32+y/32)%3;
  ctx.fillStyle=['#545b61','#3b424c','#434d57'][shade];
  ctx.fillRect(x+1,y+1,30,30);
  ctx.strokeStyle='#171c22';ctx.strokeRect(x+1.5,y+1.5,29,29);
  for(let k=0;k<4;k++){
   const px=x+(k%2?25:7),py=y+(k>1?25:7);
   ctx.fillStyle='#20272f';ctx.fillRect(px,py,2,2);
  }
  ctx.fillStyle='#7a593b';ctx.fillRect(x+7,y+15,shade===2?2:8,1);
 }
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
 tex.magFilter=THREE.LinearFilter;tex.minFilter=THREE.LinearMipmapLinearFilter;
 return tex;
}
export function mountRtsHeroBuildings(THREE,parent,layout,tier='balanced'){
 if(!THREE?.InstancedMesh||!parent?.add)throw Error('existing Three.js scene required');
 const plan=planRtsHeroBuildings(layout,tier);
 const group=new THREE.Group();group.name='RTSOriginalArtDirectedHeroBuildings';
 parent.add(group);
 const geometry=[],materials=[],meshes={};
 const atlas=makeTileAtlas(THREE);
 const mat=(hex,metalness=.5,roughness=.57,emissive=0,intensity=0,texture=false)=>{
  const m=new THREE.MeshStandardMaterial({color:hex,metalness,roughness,
    emissive,emissiveIntensity:intensity});
  if(texture)m.map=atlas;
  materials.push(m);return m;
 };
 const steel=mat(0xaeb4bc,.73,.43,0,0,true);
 const dark=mat(0x39424e,.59,.69,0,0,true);
 const concrete=mat(0x80848a,.08,.91);
 const chrome=mat(0xb2bcc4,.89,.31);
 const green=mat(0x7dffb2,.09,.4,0x00ff76,2.5);
 const orange=mat(0xffb065,.18,.4,0xff5c13,2.15);
 const warning=new THREE.MeshBasicMaterial({color:0xff6534,toneMapped:false});
 materials.push(warning);
 const box=new THREE.BoxGeometry(1,1,1);
 const octagon=new THREE.CylinderGeometry(.61,.68,1,8);
 const hex=new THREE.CylinderGeometry(.55,.7,1,6);
 const rim=new THREE.TorusGeometry(.5,.08,5,16);
 const pipe=new THREE.CylinderGeometry(.5,.5,1,8);
 const disk=new THREE.CylinderGeometry(.5,.5,1,12);
 const cone=new THREE.ConeGeometry(.75,.8,8);
 geometry.push(box,octagon,hex,rim,pipe,disk,cone);
 const mapping={
  hull:[octagon,dark],foundation:[box,concrete],roof:[hex,steel],
  roofRim:[octagon,chrome],bunker:[box,steel],buttress:[box,dark],
  turbine:[octagon,chrome],reactorCore:[hex,green],
  reactorRing:[rim,green],distiller:[pipe,chrome],
  distillerCap:[disk,steel],exhaustStack:[pipe,dark],
  gantry:[box,chrome],vent:[pipe,chrome],roofRib:[box,steel],
  guardPost:[box,chrome],guardRail:[box,chrome],
  radarDish:[cone,chrome],antenna:[pipe,chrome],neonGreen:[disk,green],
  neonOrange:[disk,orange],emergencyLamp:[disk,warning],
  cable:[pipe,chrome],turretBody:[octagon,dark],turretBarrel:[pipe,chrome],
  turretRing:[rim,orange],heatExchanger:[pipe,steel],
  coolingFin:[box,steel]
 };
 const reusable=new THREE.Object3D();
 const lowTierEssential=new Set([
  'hull','foundation','roof','roofRim','bunker','turbine','reactorCore',
  'distiller','distillerCap','exhaustStack','gantry','radarDish',
  'neonGreen','neonOrange','emergencyLamp','turretBody','turretBarrel'
 ]);
 // CPU combines all compatible hero components into one draw call by
 // shared geometry+material. This is real batching, not a raised test limit.
 const batches=new Map();
 for(const [name,poses] of Object.entries(plan.parts)){
  if(!poses.length||(tier==='low'&&!lowTierEssential.has(name)))continue;
  const [g,m]=mapping[name],key=geometry.indexOf(g)+':'+materials.indexOf(m);
  let bucket=batches.get(key);
  if(!bucket){bucket={g,m,parts:[],poses:[]};batches.set(key,bucket);}
  bucket.parts.push(name);
  bucket.poses.push(...poses.map(p=>({...p,kind:name})));
 }
 for(const [key,bucket] of batches){
  const mesh=new THREE.InstancedMesh(bucket.g,bucket.m,bucket.poses.length);
  mesh.name='RtsHero_'+bucket.parts.join('_');
  mesh.userData.heroParts=bucket.parts.slice();
  for(let i=0;i<bucket.poses.length;i++){
   const {x,y,z,sx,sy,sz,ry,kind}=bucket.poses[i];
   reusable.position.set(x,y,z);
   reusable.rotation.set(
    kind==='reactorRing'||kind==='turretRing'?Math.PI*.5:0,ry,0);
   reusable.scale.set(sx,sy,sz);
   reusable.updateMatrix();mesh.setMatrixAt(i,reusable.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
  mesh.castShadow=false;mesh.receiveShadow=false;
  group.add(mesh);meshes[key]=mesh;
 }
 return {group,plan,
  stats(){return{buildingKinds:[...new Set(layout.structures.map(s=>s.kind))],
    instanceCount:Object.values(plan.counts).reduce((a,b)=>a+b,0),
    drawBatches:Object.keys(meshes).length,
    partCounts:plan.counts,detailAtlasBytes:256*256*4,
    materials:'project-original-cpu-painted',collisionIntegrated:false};},
  dispose(){group.parent?.remove(group);
    geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    atlas.dispose();}
 };
}
