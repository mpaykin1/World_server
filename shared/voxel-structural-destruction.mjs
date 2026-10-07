// Deterministic structural-destruction planning for editable voxel worlds.
// This module decides canonical damage/support/collapse clusters. A runtime
// rigid-body backend (for example Rapier) may animate returned bodies later.
export const STRUCTURAL_DESTRUCTION_VERSION = 1;

export const MATERIALS = Object.freeze({
  1: Object.freeze({ name: 'grass', density: 1.2, impactStrength: 28, brittleness: .45, friction: .85 }),
  2: Object.freeze({ name: 'dirt', density: 1.55, impactStrength: 34, brittleness: .42, friction: .90 }),
  3: Object.freeze({ name: 'stone', density: 2.40, impactStrength: 120, brittleness: .72, friction: .82 }),
  4: Object.freeze({ name: 'sand', density: 1.40, impactStrength: 18, brittleness: .55, friction: .78 }),
  5: Object.freeze({ name: 'wood', density: .68, impactStrength: 46, brittleness: .30, friction: .70 }),
  6: Object.freeze({ name: 'leaves', density: .15, impactStrength: 6, brittleness: .25, friction: .65 }),
  7: Object.freeze({ name: 'snow', density: .35, impactStrength: 8, brittleness: .30, friction: .45 }),
  9: Object.freeze({ name: 'glass', density: .25, impactStrength: 14, brittleness: .98, friction: .35 }),
  10: Object.freeze({ name: 'brick', density: 1.90, impactStrength: 78, brittleness: .84, friction: .80 }),
  11: Object.freeze({ name: 'plank', density: .62, impactStrength: 40, brittleness: .34, friction: .68 }),
  12: Object.freeze({ name: 'coal', density: 1.35, impactStrength: 54, brittleness: .80, friction: .72 }),
  13: Object.freeze({ name: 'iron', density: 3.50, impactStrength: 220, brittleness: .22, friction: .62 }),
});

const DIR6 = Object.freeze([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]);
const key3 = (x,y,z) => `${x},${y},${z}`;
const finite = value => Number.isFinite(Number(value));
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function materialForBlock(blockType) {
  return MATERIALS[Number(blockType)] || Object.freeze({
    name: 'generic', density: 1, impactStrength: 50, brittleness: .5, friction: .7,
  });
}

function normalizeVoxel(raw) {
  const x = Number(raw?.x), y = Number(raw?.y), z = Number(raw?.z), blockType = Number(raw?.blockType);
  if (![x,y,z,blockType].every(finite) || ![x,y,z,blockType].every(Number.isInteger)) throw new TypeError('Invalid structural voxel');
  if (blockType === 0) return null;
  return { ...raw, x, y, z, blockType, role: raw.role ? String(raw.role) : '' };
}

function normalizeVoxels(voxels, maxVoxels = 50000) {
  if (!Array.isArray(voxels) || voxels.length > maxVoxels) throw new RangeError('Invalid structural voxel count');
  const byKey = new Map();
  for (const raw of voxels) {
    const voxel = normalizeVoxel(raw);
    if (voxel) byKey.set(key3(voxel.x,voxel.y,voxel.z), voxel);
  }
  return byKey;
}

export function buildStructuralGraph(voxels, options = {}) {
  const nodeByKey = normalizeVoxels(voxels, options.maxVoxels);
  const keys = [...nodeByKey.keys()].sort();
  const neighbors = new Map();
  for (const key of keys) {
    const v = nodeByKey.get(key), list = [];
    for (const [dx,dy,dz] of DIR6) {
      const next = key3(v.x+dx,v.y+dy,v.z+dz);
      if (nodeByKey.has(next)) list.push(next);
    }
    neighbors.set(key, list.sort());
  }
  return { nodeByKey, neighbors, keys };
}

function extractComponents(graph) {
  const seen = new Set(), components = [];
  for (const start of graph.keys) {
    if (seen.has(start)) continue;
    const queue = [start], keys = []; seen.add(start);
    for (let i=0;i<queue.length;i++) {
      const key = queue[i]; keys.push(key);
      for (const next of graph.neighbors.get(key) || []) if (!seen.has(next)) {
        seen.add(next); queue.push(next);
      }
    }
    components.push(keys.sort());
  }
  return components;
}

function massProperties(keys, nodeByKey) {
  let mass = 0, sx = 0, sy = 0, sz = 0;
  for (const key of keys) {
    const v = nodeByKey.get(key), m = materialForBlock(v.blockType).density;
    mass += m; sx += v.x*m; sy += v.y*m; sz += v.z*m;
  }
  const inv = mass > 0 ? 1/mass : 0;
  return { mass, centerOfMass: { x:sx*inv, y:sy*inv, z:sz*inv } };
}

function foundationKeys(keys, nodeByKey, options) {
  const roles = new Set(options.foundationRoles || ['foundation']);
  const implicit = options.implicitGround === true;
  const groundY = Number.isFinite(options.groundY) ? Number(options.groundY) : 0;
  return keys.filter(key => {
    const v = nodeByKey.get(key);
    return roles.has(v.role) || (implicit && v.y <= groundY);
  });
}

const ROLE_SUPPORT_DISTANCE=Object.freeze({
  foundation:0,pier:0,wall:4,window:4,arch:6,deck:4,roof:8,spire:8,
});

function supportDistanceLimit(voxel,options){
  const custom=options.roleSupportDistance?.[voxel.role];
  if(Number.isFinite(custom))return Math.max(0,Number(custom));
  const role=ROLE_SUPPORT_DISTANCE[voxel.role];
  if(Number.isFinite(role))return role;
  return Number.isFinite(options.maxHorizontalSupportDistance)
    ? Math.max(0,Number(options.maxHorizontalSupportDistance)) : Infinity;
}

function computeSupportDistances(graph,options){
  const anchors=foundationKeys(graph.keys,graph.nodeByKey,options);
  const distance=new Map(),current=[...anchors];
  for(const key of anchors)distance.set(key,0);
  const budget=clamp(Math.trunc(options.supportDistanceBudget??64),1,256);
  for(let d=0;current.length&&d<=budget;d++){
    const next=[];
    for(let i=0;i<current.length;i++){
      const key=current[i];if(distance.get(key)!==d)continue;
      const v=graph.nodeByKey.get(key);
      for(const neighbor of graph.neighbors.get(key)||[]){
        const n=graph.nodeByKey.get(neighbor);
        const candidate=d+(n.y===v.y?1:0),known=distance.get(neighbor);
        if(known!==undefined&&known<=candidate)continue;
        distance.set(neighbor,candidate);
        (candidate===d?current:next).push(neighbor);
      }
    }
    current.splice(0,current.length,...next);
  }
  return distance;
}

function extractSubsetComponents(graph,subset){
  const seen=new Set(),components=[];
  for(const start of [...subset].sort()){
    if(seen.has(start))continue;
    const queue=[start],keys=[];seen.add(start);
    for(let i=0;i<queue.length;i++){
      const key=queue[i];keys.push(key);
      for(const next of graph.neighbors.get(key)||[])if(subset.has(next)&&!seen.has(next)){
        seen.add(next);queue.push(next);
      }
    }
    components.push(keys.sort());
  }
  return components;
}

function spanFailureRegions(graph,options){
  if(options.enableSpanSupport!==true)return {distance:new Map(),regions:[],unsupportedKeys:new Set()};
  const distance=computeSupportDistances(graph,options),unsupportedKeys=new Set();
  for(const key of graph.keys){
    const voxel=graph.nodeByKey.get(key),limit=supportDistanceLimit(voxel,options),d=distance.get(key);
    if(Number.isFinite(limit)&&(d===undefined||d>limit))unsupportedKeys.add(key);
  }
  const regions=extractSubsetComponents(graph,unsupportedKeys).map(keys=>({
    keys,anchors:[],...massProperties(keys,graph.nodeByKey),status:'unsupported-span',support:null,
  }));
  return {distance,regions,unsupportedKeys};
}

function supportBounds(keys, nodeByKey) {
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,sx=0,sy=0,sz=0;
  for (const key of keys) {
    const v=nodeByKey.get(key);
    minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minZ=Math.min(minZ,v.z);maxZ=Math.max(maxZ,v.z);
    sx+=v.x;sy+=v.y;sz+=v.z;
  }
  const n=Math.max(1,keys.length);
  return {minX,maxX,minZ,maxZ,center:{x:sx/n,y:sy/n,z:sz/n}};
}

function componentState(keys, graph, options) {
  const anchors = foundationKeys(keys, graph.nodeByKey, options);
  const props = massProperties(keys, graph.nodeByKey);
  if (!anchors.length) return { keys, anchors, ...props, status:'unsupported', support:null };
  const support = supportBounds(anchors, graph.nodeByKey);
  const margin = Number.isFinite(options.supportMargin) ? Math.max(0,options.supportMargin) : .65;
  const c = props.centerOfMass;
  const inside = c.x >= support.minX-margin && c.x <= support.maxX+margin &&
    c.z >= support.minZ-margin && c.z <= support.maxZ+margin;
  return { keys, anchors, ...props, status:inside?'supported':'topple-risk', support };
}

export function analyzeStructuralSupport(voxels, options = {}) {
  const graph = buildStructuralGraph(voxels, options);
  const components = extractComponents(graph).map(keys => componentState(keys, graph, options));
  const counts = { supported:0, unsupported:0, 'topple-risk':0 };
  for (const component of components) counts[component.status]++;
  const span=spanFailureRegions(graph,options);
  return {
    graph,components,counts,
    supportDistance:span.distance,
    spanRegions:span.regions,
    spanUnsupportedVoxels:span.unsupportedKeys.size,
  };
}

function normalizedDirection(direction = {}) {
  let x=Number(direction.x)||0,y=Number(direction.y)||0,z=Number(direction.z)||0;
  const m=Math.hypot(x,y,z);
  if (m < 1e-9) return {x:1,y:0,z:0};
  x/=m;y/=m;z/=m;return{x,y,z};
}

function hashId(keys) {
  let h=2166136261>>>0;
  for (const key of keys) for (let i=0;i<key.length;i++) {
    h^=key.charCodeAt(i);h=Math.imul(h,16777619)>>>0;
  }
  return h.toString(16).padStart(8,'0');
}

function aabb(keys,nodeByKey) {
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (const key of keys) {
    const v=nodeByKey.get(key);
    minX=Math.min(minX,v.x);minY=Math.min(minY,v.y);minZ=Math.min(minZ,v.z);
    maxX=Math.max(maxX,v.x);maxY=Math.max(maxY,v.y);maxZ=Math.max(maxZ,v.z);
  }
  return {minX,minY,minZ,maxX,maxY,maxZ};
}

function collapseDirection(component, impactDirection) {
  const fallback=normalizedDirection(impactDirection);
  if (!component.support) return fallback;
  const dx=component.centerOfMass.x-component.support.center.x;
  const dz=component.centerOfMass.z-component.support.center.z;
  const mag=Math.hypot(dx,dz);
  if (mag < .05) return fallback;
  return {x:dx/mag,y:0,z:dz/mag};
}

function bodyPlan(component, graph, impactDirection) {
  const direction=collapseDirection(component,impactDirection);
  const pivot=component.support?.center || {
    x:component.centerOfMass.x,y:aabb(component.keys,graph.nodeByKey).minY,z:component.centerOfMass.z,
  };
  const speed=clamp(1.3+Math.log2(1+component.mass)*.18,1.3,4.2);
  return {
    id:`collapse-${hashId(component.keys)}`,
    status:component.status,
    voxelKeys:[...component.keys],
    voxelCount:component.keys.length,
    mass:+component.mass.toFixed(4),
    centerOfMass:component.centerOfMass,
    pivot,
    aabb:aabb(component.keys,graph.nodeByKey),
    linearVelocity:{x:direction.x*speed,y:-.45,z:direction.z*speed},
    angularVelocity:{x:-direction.z*.9,y:0,z:direction.x*.9},
    materialMix:materialMix(component.keys,graph.nodeByKey),
  };
}

function materialMix(keys,nodeByKey) {
  const counts={};
  for (const key of keys) {
    const name=materialForBlock(nodeByKey.get(key).blockType).name;
    counts[name]=(counts[name]||0)+1;
  }
  return counts;
}

export function planCollapseBodies(analysis, options = {}) {
  const maxBodies=clamp(Math.trunc(options.maxBodies ?? 32),1,128);
  const maxClusterVoxels=clamp(Math.trunc(options.maxClusterVoxels ?? 8192),1,50000);
  const whole=analysis.components.filter(c=>c.status!=='supported');
  const reserved=new Set(whole.flatMap(c=>c.keys));
  const spans=(analysis.spanRegions||[]).filter(c=>!c.keys.some(k=>reserved.has(k)));
  const unstable=[...whole,...spans].sort((a,b)=>b.mass-a.mass||a.keys[0].localeCompare(b.keys[0]));
  const bodies=[],deferred=[];
  for (const component of unstable) {
    if (bodies.length>=maxBodies || component.keys.length>maxClusterVoxels) {
      deferred.push({id:`collapse-${hashId(component.keys)}`,voxelCount:component.keys.length,reason:'budget'});
      continue;
    }
    bodies.push(bodyPlan(component,analysis.graph,options.impactDirection));
  }
  return { bodies, deferred, unstableCount:unstable.length };
}

export function applyCannonImpact(voxels, impact = {}, options = {}) {
  const point={x:Number(impact.point?.x)||0,y:Number(impact.point?.y)||0,z:Number(impact.point?.z)||0};
  const direction=normalizedDirection(impact.direction);
  const mass=clamp(Number(impact.mass)||12,.1,200);
  const speed=clamp(Number(impact.speed)||22,.1,200);
  const radius=clamp(Number(impact.radius)||2.2,.1,12);
  const energyScale=clamp(Number(impact.energyScale)||1,.001,10);
  const kineticEnergy=.5*mass*speed*speed*energyScale;
  const maxDestroyed=clamp(Math.trunc(options.maxDestroyed ?? impact.maxDestroyed ?? 256),1,4096);
  const byKey=normalizeVoxels(voxels,options.maxVoxels), candidates=[];

  for (const [key,v] of byKey) {
    const distance=Math.hypot(v.x-point.x,v.y-point.y,v.z-point.z);
    if (distance>radius) continue;
    const falloff=Math.max(0,1-distance/radius);
    const deposited=kineticEnergy*falloff*falloff;
    const material=materialForBlock(v.blockType);
    const damageRatio=deposited/material.impactStrength;
    if (damageRatio>=1) candidates.push({key,voxel:v,distance,damageRatio,deposited,material:material.name});
  }
  candidates.sort((a,b)=>b.damageRatio-a.damageRatio||a.distance-b.distance||a.key.localeCompare(b.key));
  const destroyed=candidates.slice(0,maxDestroyed), destroyedKeys=new Set(destroyed.map(x=>x.key));
  const remaining=[...byKey].filter(([key])=>!destroyedKeys.has(key)).map(([,v])=>v);
  return {remaining,destroyed,kineticEnergy,direction,point,radius,truncated:candidates.length>maxDestroyed};
}

export function simulateCannonCollapse(voxels, impact = {}, options = {}) {
  const damage=applyCannonImpact(voxels,impact,options);
  const analysis=analyzeStructuralSupport(damage.remaining,options);
  const collapse=planCollapseBodies(analysis,{...options,impactDirection:damage.direction});
  return {version:STRUCTURAL_DESTRUCTION_VERSION,damage,analysis,collapse};
}

function collisionVoxel(byKey,position){
  const x=Math.round(position.x),y=Math.round(position.y),z=Math.round(position.z);
  return byKey.get(key3(x,y,z))||null;
}

export function traceCannonProjectile(voxels, shot = {}, options = {}) {
  const byKey=normalizeVoxels(voxels,options.maxVoxels);
  const start={x:Number(shot.origin?.x)||0,y:Number(shot.origin?.y)||0,z:Number(shot.origin?.z)||0};
  const velocity={
    x:Number(shot.velocity?.x)||0,
    y:Number(shot.velocity?.y)||0,
    z:Number(shot.velocity?.z)||0,
  };
  if(Math.hypot(velocity.x,velocity.y,velocity.z)<.01)throw new RangeError('Projectile velocity required');
  const gravity=clamp(Number(options.gravity ?? -9.81),-50,0);
  const maxTime=clamp(Number(options.maxTime ?? 8),.05,30);
  const maxStep=clamp(Number(options.maxStep ?? .125),.02,.25);
  const maxSamples=clamp(Math.trunc(options.maxSamples ?? 4096),16,20000);
  const position={...start},path=[{...start,t:0}];
  let t=0,samples=0;
  while(t<maxTime&&samples<maxSamples){
    const speed=Math.hypot(velocity.x,velocity.y,velocity.z);
    const dt=Math.min(maxTime-t,Math.max(.001,maxStep/Math.max(speed,1)));
    velocity.y+=gravity*dt;
    position.x+=velocity.x*dt;position.y+=velocity.y*dt;position.z+=velocity.z*dt;
    t+=dt;samples++;
    const hit=collisionVoxel(byKey,position);
    if(hit){
      return {hit:true,voxel:hit,point:{...position},velocity:{...velocity},time:t,samples,path};
    }
    if(samples===1||samples%8===0)path.push({...position,t});
  }
  return {hit:false,voxel:null,point:{...position},velocity:{...velocity},time:t,samples,path};
}

export function fireCannonAtStructure(voxels, shot = {}, options = {}) {
  const flight=traceCannonProjectile(voxels,shot,options);
  if(!flight.hit){
    return {
      version:STRUCTURAL_DESTRUCTION_VERSION,
      flight,
      damage:null,
      analysis:analyzeStructuralSupport(voxels,options),
      collapse:{bodies:[],deferred:[],unstableCount:0},
    };
  }
  const speed=Math.hypot(flight.velocity.x,flight.velocity.y,flight.velocity.z);
  const result=simulateCannonCollapse(voxels,{
    point:flight.point,
    direction:flight.velocity,
    mass:shot.mass,
    speed,
    radius:shot.damageRadius,
    energyScale:shot.energyScale,
    maxDestroyed:shot.maxDestroyed,
  },options);
  return {...result,flight};
}
