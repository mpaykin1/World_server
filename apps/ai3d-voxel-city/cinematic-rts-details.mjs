/**
 * Deterministic CPU-driven industrial kitbashing and volcanic detail.
 * Bounded instanced meshes; actual Three.js geometry, not screenshot overlays.
 */
const QUALITY=Object.freeze({
  low:{debris:42,rocks:20,structureSteps:2},
  balanced:{debris:115,rocks:65,structureSteps:4},
  high:{debris:190,rocks:98,structureSteps:5},
  ultra:{debris:260,rocks:125,structureSteps:6}
});
export function detailBudget(tier){return QUALITY[tier]||QUALITY.balanced;}
function random(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
export function planIndustrialDetails(layout,tier='balanced',seed=20260925){
  if(!layout||!Array.isArray(layout.structures)||!Array.isArray(layout.tiles))
    throw Error('missing layout');
  const q=detailBudget(tier),rand=random(seed);
  const pieces={facadePanels:[],roofRibs:[],roofVents:[],fences:[],
    ladders:[],conduit:[],tanks:[],beacons:[],antennas:[],groundDebris:[],
    rockOutcrops:[],hotFissures:[],scorchDecals:[],crystalChips:[],
    hazardBands:[],machineFans:[]};
  const push=(name,x,y,z,sx,sy,sz,ry=0)=>pieces[name].push({x,y,z,sx,sy,sz,ry});
  const buildings=layout.structures.filter(s=>s.kind!=='turret');
  for(const s of buildings){
    const count=q.structureSteps,top=s.height-1.72;
    // Recessed wall panels avoid covering existing warm windows above.
    for(let i=0;i<count;i++){
      const offset=(i+.5)/count-.5;
      push('facadePanels',s.x+offset*s.width*.74,.52,s.z+s.depth*.509,
        s.width/count*.6,1.04,.08);
      push('facadePanels',s.x+s.width*.509,.58,s.z+offset*s.depth*.69,
        .08,1.07,s.depth/count*.61);
      push('roofRibs',s.x+offset*s.width*.84,top+.44,s.z,
        .22,.36,s.depth*.84);
      if(i%2===0){
        push('roofVents',s.x+offset*s.width*.7,top+1.02,
          s.z+s.depth*.23,.64,1.4,.64);
        push('machineFans',s.x+offset*s.width*.7,top+1.83,
          s.z+s.depth*.23,.84,.16,.84);
      }
    }
    // Proper continuous-looking maintenance rail on all four roof sides.
    const width=s.width*.91,depth=s.depth*.91;
    for(let k=0;k<4;k++){
      const alongX=k%2===0,z=s.z+(k===0?depth*.5:-depth*.5);
      const x=s.x+(k===1?width*.5:-width*.5);
      if(alongX){
        for(let i=0;i<3;i++)push('fences',s.x-width*.5+width*i/2,
          top+.94,z,.095,1.6,.095);
        push('conduit',s.x,top+1.65,z,width,.12,.12);
      }else{
        for(let i=0;i<3;i++)push('fences',x,top+.94,
          s.z-depth*.5+depth*i/2,.095,1.6,.095);
        push('conduit',x,top+1.65,s.z,.12,.12,depth);
      }
    }
    for(let y=0;y<s.height-1.7;y+=.8)
      push('ladders',s.x-s.width*.5-.08,y+.3,s.z-s.depth*.28,.17,.095,1.25);
    push('antennas',s.x-s.width*.21,top+3,s.z-s.depth*.23,.095,5.7,.095);
    push('beacons',s.x-s.width*.21,top+6,s.z-s.depth*.23,.47,.26,.47);
    for(let i=0;i<3;i++){
      const x=s.x-s.width*.37+i*s.width*.35;
      push('conduit',x,1.65,s.z+s.depth*.62,.22,.22,4.1);
    }
    if(s.kind==='refinery'||s.kind==='factory'){
      for(let i=0;i<3;i++)
        push('tanks',s.x+s.width*.7+i*2.7,2.3,
          s.z-s.depth*.24+(i%2)*3,1.13,4.5,1.13);
    }
  }
  const terrain=layout.tiles.filter(t=>t.style==='basalt');
  const debris=Math.min(q.debris,terrain.length),rocks=Math.min(q.rocks,terrain.length);
  for(let i=0;i<debris;i++){
    const tile=terrain[(i*37+3)%terrain.length],a=rand()*Math.PI*2;
    push('groundDebris',tile.x+(rand()-.5)*layout.step*.72,-1.76,
      tile.z+(rand()-.5)*layout.step*.72,
      .19+rand()*.49,.12+rand()*.29,.18+rand()*.35,a);
    if(i%3===0)
      push('scorchDecals',tile.x+(rand()-.5)*layout.step*.6,-1.995,
        tile.z+(rand()-.5)*layout.step*.6,.6+rand()*1.4,.02,
        1.4+rand()*1.2,a);
  }
  for(let i=0;i<rocks;i++){
    const tile=terrain[(i*23+11)%terrain.length];
    push('rockOutcrops',tile.x+(rand()-.5)*layout.step*.7,
      -1.5,tile.z+(rand()-.5)*layout.step*.7,.55+rand()*1.2,
      .48+rand()*1.5,.45+rand()*1.1,rand()*Math.PI*2);
  }
  const key=(x,z)=>Math.round(x*100)+':'+Math.round(z*100);
  const hotSet=new Set(layout.lava.map(t=>key(t.x,t.z)));
  let fissureCount=0;
  for(const tile of layout.tiles){
    if(fissureCount>=Math.min(q.debris,95))break;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      if(!hotSet.has(key(tile.x+dx*layout.step,tile.z+dz*layout.step)))continue;
      if(rand()>.7)continue;
      push('hotFissures',tile.x+dx*layout.step*.4,-1.85,
        tile.z+dz*layout.step*.4,
        dx===0?layout.step*.53:.22,.045,dz===0?layout.step*.53:.22);
      fissureCount++;break;
    }
  }
  for(const r of layout.resources){
    const angles=[.45,2.4,4.8];
    for(let j=0;j<(tier==='low'?1:3);j++){
      const a=angles[j]+r.yaw,dist=r.size*.6;
      push('crystalChips',r.x+Math.cos(a)*dist,-.21+r.size*.3,
        r.z+Math.sin(a)*dist,r.size*.25,r.size*(.43+.18*j),
        r.size*.27,a);
    }
  }
  for(const s of layout.stripes)
    push('hazardBands',s.x,-1.84,s.z,layout.step*.31,.035,.13,s.rotation);
  return {tier,pieces,stats:Object.fromEntries(Object.entries(pieces).map(([k,v])=>[k,v.length]))};
}
export function mountIndustrialDetails(THREE,parent,layout,tier='balanced'){
  const plan=planIndustrialDetails(layout,tier,layout.seed+51);
  const group=new THREE.Group();group.name='RTSInstancedHeroDetails';parent.add(group);
  const geom=[],mat=[],draws={};
  const cube=new THREE.BoxGeometry(1,1,1),cyl=new THREE.CylinderGeometry(.5,.5,1,8);
  const rock=new THREE.IcosahedronGeometry(1,0),cone=new THREE.ConeGeometry(.5,1.7,5);
  geom.push(cube,cyl,rock,cone);
  const create=(name,g,m,data)=>{
    if(!data.length)return;
    const mesh=new THREE.InstancedMesh(g,m,data.length),o=new THREE.Object3D();
    for(let i=0;i<data.length;i++){
      const p=data[i];o.position.set(p.x,p.y,p.z);
      o.scale.set(p.sx,p.sy,p.sz);o.rotation.set(0,p.ry,0);
      o.updateMatrix();mesh.setMatrixAt(i,o.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.name='RtsDetail_'+name;mesh.castShadow=false;mesh.receiveShadow=false;
    group.add(mesh);draws[name]=mesh;
  };
  const steel=new THREE.MeshStandardMaterial({color:0x646d72,roughness:.52,metalness:.62});
  const dark=new THREE.MeshStandardMaterial({color:0x272d32,roughness:.78,metalness:.23});
  const basalt=new THREE.MeshStandardMaterial({color:0x24262b,roughness:.94,flatShading:true});
  const glow=new THREE.MeshBasicMaterial({color:0xff7625,toneMapped:false});
  const crystal=new THREE.MeshStandardMaterial({color:0x90ceff,
    emissive:0x256cff,emissiveIntensity:1.23,metalness:.09,roughness:.19,
    flatShading:true});
  const yellow=new THREE.MeshBasicMaterial({color:0xe2a339,toneMapped:false});
  mat.push(steel,dark,basalt,glow,crystal,yellow);
  const list=plan.pieces;
  for(const key of ['facadePanels','roofRibs','roofVents','fences','ladders',
    'conduit','tanks','antennas','machineFans'])
    create(key,key==='roofVents'||key==='tanks'?cyl:cube,
      key==='facadePanels'||key==='machineFans'?dark:steel,list[key]);
  create('beacons',cube,glow,list.beacons);
  create('groundDebris',cube,basalt,list.groundDebris);
  create('rockOutcrops',rock,basalt,list.rockOutcrops);
  create('hotFissures',cube,glow,list.hotFissures);
  create('scorchDecals',cube,dark,list.scorchDecals);
  create('crystalChips',cone,crystal,list.crystalChips);
  create('hazardBands',cube,yellow,list.hazardBands);
  return {group,plan,stats(){
    return {instances:Object.values(plan.stats).reduce((a,b)=>a+b,0),
      batches:Object.keys(draws).length,byType:plan.stats,
      cpuGenerated:true,source:'project-original',visualOnly:true};
  },dispose(){group.parent?.remove(group);geom.forEach(g=>g.dispose());
    mat.forEach(m=>m.dispose());}};
}
