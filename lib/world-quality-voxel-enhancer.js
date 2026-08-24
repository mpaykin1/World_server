'use strict';
const fs=require('fs'),path=require('path');
const {semanticDetailIndex,key2,luma,chroma}=require('./world-quality-semantic-detail');
const {buildMaterialProfiles}=require('./world-quality-material-profiler');
const {synthesizePbrProfiles}=require('./world-quality-pbr-synthesizer');

const DEFAULTS=Object.freeze({
  maxAddedVoxelRatio:.28,maxAddedVoxelAbsolute:42000,edgeThreshold:.12,edgeDensity:.9,
  maxBackReliefDepth:5,roofBackReliefDepth:4,corniceSpacing:5,pillarSpacing:6,
  rearMassFillDepth:3,prioritySort:true,semanticDetail:true,windowRecessDepth:2,
  spireBackDepth:5,groundMicroReliefDepth:1
});
function readPolicy(rootDir=process.cwd()){
  try{const j=JSON.parse(fs.readFileSync(path.join(rootDir,'data','world-quality-autopilot.json'),'utf8'));return{...DEFAULTS,...(j.detail||{})}}
  catch{return{...DEFAULTS}}
}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),key3=(x,y,z)=>`${x},${y},${z}`;
function hash32(x,y,seed){let h=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^(seed|0))|0;h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0}
const unitHash=(x,y,s)=>hash32(x,y,s)/0xffffffff;
function frontProjection(vs){const m=new Map();for(const v of vs||[]){if(!Array.isArray(v)||v.length<4)continue;const x=+v[0],y=+v[1],z=+v[2];if(![x,y,z].every(Number.isFinite))continue;const k=key2(x,y),q=m.get(k);if(!q||z>q.z)m.set(k,{x,y,z,color:+v[3]||0})}return m}
function sameFrontProjection(a,b){const pa=frontProjection(a),pb=frontProjection(b);if(pa.size!==pb.size)return false;for(const[k,v]of pa){const q=pb.get(k);if(!q||q.z!==v.z||q.color!==v.color)return false}return true}

function enhanceVoxelWorld(world,options={}){
  if(!world||!Array.isArray(world.voxels)||!Array.isArray(world.palette)||!world.voxels.length)return world;
  const p={...readPolicy(options.rootDir),...(options.policy||{})};if(p.enabled===false||options.enabled===false)return world;
  const source=world.voxels.map(v=>Array.isArray(v)?v.slice():v),palette=world.palette,occupied=new Set();
  for(const v of source){if(Array.isArray(v)&&v.length>=4)occupied.add(key3(Math.trunc(+v[0]),Math.trunc(+v[1]),Math.trunc(+v[2])))}
  const semantic=semanticDetailIndex(source,palette),cells=semantic.cells,intents=semantic.intents;
  const sourceCount=source.length,maxAdded=Math.max(0,Math.min(Math.trunc(+p.maxAddedVoxelAbsolute||DEFAULTS.maxAddedVoxelAbsolute),Math.floor(sourceCount*clamp(+p.maxAddedVoxelRatio||DEFAULTS.maxAddedVoxelRatio,0,.6))));
  if(!maxAdded||!cells.size)return world;
  const seed=(+options.seed||+world?.qualityAutopilot?.seed||+world?.source?.width*131+ +world?.source?.height*977+0x61b9)|0,additions=[];
  const stats={...semantic.stats,corniceCandidates:0,pillarCandidates:0,rearMassCandidates:0,windowRecesses:0,spireRelief:0,groundMicroRelief:0};
  const at=(x,y)=>cells.get(key2(x,y)),intentAt=(x,y)=>intents.get(key2(x,y)),pal=i=>+palette[i]||0;
  const tryAdd=(x,y,z,c)=>{if(additions.length>=maxAdded)return false;const k=key3(x,y,z);if(occupied.has(k))return false;occupied.add(k);additions.push([x,y,z,c]);return true};
  const threshold=clamp(+p.edgeThreshold||.12,.02,1),density=clamp(+p.edgeDensity||.9,0,1),maxRelief=clamp(Math.trunc(+p.maxBackReliefDepth||5),1,8),roofDepth=clamp(Math.trunc(+p.roofBackReliefDepth||4),1,6),corniceSpacing=clamp(Math.trunc(+p.corniceSpacing||5),3,12),pillarSpacing=clamp(Math.trunc(+p.pillarSpacing||6),3,14),rearFill=clamp(Math.trunc(+p.rearMassFillDepth||3),0,5),windowDepth=clamp(Math.trunc(+p.windowRecessDepth||2),1,4),spireDepth=clamp(Math.trunc(+p.spireBackDepth||5),2,8),groundDepth=clamp(Math.trunc(+p.groundMicroReliefDepth||1),0,2),candidates=[];

  for(const c of cells.values()){
    if(c.y<=0)continue;const intent=intentAt(c.x,c.y)||{};const here=luma(pal(c.color));let edge=0,depthVar=0,missing=0;
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const n=at(c.x+dx,c.y+dy);if(!n){missing++;edge=Math.max(edge,.44);continue}edge=Math.max(edge,Math.abs(here-luma(pal(n.color)))*.74);depthVar=Math.max(depthVar,Math.min(1,Math.abs(c.front-n.front)/5))}
    edge=Math.min(1,edge+depthVar*.58);const roof=!!intent.roof,left=at(c.x-1,c.y),right=at(c.x+1,c.y),vertical=!!left&&!!right&&Math.abs(left.front-right.front)>=1,cornice=(c.y%corniceSpacing===0)&&edge>.16,pillar=(c.x%pillarSpacing===0)&&(vertical||missing>0);
    const score=edge*1.28+(roof?.34:0)+(cornice?.20:0)+(pillar?.20:0)+(intent.windowLike?.30:0)+(intent.spireLike?.42:0)+(intent.verticalEdge?.18:0)+(intent.groundBand?.08:0)+chroma(pal(c.color))*.10+Math.min(1,Math.abs(c.y)/64)*.07;
    if(cornice)stats.corniceCandidates++;if(pillar)stats.pillarCandidates++;candidates.push({c,intent,edge,roof,cornice,pillar,score});
  }
  if(p.prioritySort!==false)candidates.sort((a,b)=>b.score-a.score||(a.c.y-b.c.y)||(a.c.x-b.c.x));

  for(const item of candidates){
    if(additions.length>=maxAdded)break;const{c,intent,edge,roof,cornice,pillar,score}=item;
    if(edge<threshold&&!intent.windowLike&&!intent.spireLike&&!roof&&!intent.verticalEdge)continue;
    if(unitHash(c.x,c.y,seed)>Math.min(1,density*(.20+score*.64)))continue;
    const start=c.back-1;let depth=clamp(1+Math.floor(edge*maxRelief)+(cornice?1:0)+(pillar?1:0),1,maxRelief);if(roof)depth=Math.max(depth,roofDepth);if(intent.spireLike)depth=Math.max(depth,spireDepth);
    for(let d=0;d<depth;d++)if(!tryAdd(c.x,c.y,start-d,c.color))break;
    if(rearFill&&score>.50){stats.rearMassCandidates++;for(let d=depth;d<Math.min(maxRelief+rearFill,depth+rearFill);d++)tryAdd(c.x,c.y,start-d,c.color)}
    if(intent.windowLike){stats.windowRecesses++;for(let d=0;d<windowDepth;d++)tryAdd(c.x,c.y,start-depth-d,c.color)}
    if(intent.spireLike){stats.spireRelief++;for(let d=depth;d<Math.min(spireDepth+2,depth+2);d++)tryAdd(c.x,c.y,start-d,c.color)}
    if(intent.groundBand&&groundDepth&&((c.x+c.y)&1)===0){stats.groundMicroRelief++;for(let d=0;d<groundDepth;d++)tryAdd(c.x,c.y,start-depth-d,c.color)}
    if(cornice)for(const n of[at(c.x-1,c.y),at(c.x+1,c.y)])if(n)tryAdd(n.x,n.y,n.back-1-depth,n.color);
    if(pillar)for(const n of[at(c.x,c.y-1),at(c.x,c.y+1)])if(n)tryAdd(n.x,n.y,n.back-1-depth,n.color);
  }

  const enhanced=source.concat(additions);if(!sameFrontProjection(source,enhanced))throw new Error('WORLD_QUALITY_AUTOPILOT_V4 front-projection invariant violated');
  world.voxels=enhanced;
  world.materialProfiles=buildMaterialProfiles(palette);
  world.pbrProfiles=synthesizePbrProfiles(world.materialProfiles,{seed});
  world.performance={...(world.performance||{}),chunkSize:+world?.performance?.chunkSize||16,logicalRepresentation:'cubes',browserMeshing:'chunked_greedy_surface',internalFaceCulling:true,farLod:'chunk_aabb_hlod',streaming:'camera_or_player_centered',adaptiveResolution:true,worldQualityAutopilot:true,gpuTimingTarget:true,visibilityBudgetTarget:true,longTaskBudgetTarget:true,deviceProfileTarget:true,pbrTierTarget:true,proceduralPbrProfiles:true,sectorVisibilityTarget:true,textureBudgetTarget:true};
  world.qualityAutopilot={...(world.qualityAutopilot||{}),version:'4.0.0',strategy:'semantic_multiscale_architecture_material_aware',enabled:true,deterministic:true,seed,sourceVoxels:sourceCount,addedVoxels:additions.length,addedRatio:+(additions.length/Math.max(1,sourceCount)).toFixed(4),finalVoxels:enhanced.length,frontProjectionPreserved:true,mutationDirection:'behind_reference_front_shell_only',budgetLimited:additions.length>=maxAdded,semanticStats:stats,materialProfileCount:world.materialProfiles.length,pbrProfileCount:world.pbrProfiles.length,prioritySorted:p.prioritySort!==false};
  if(world.stats&&typeof world.stats==='object'){world.stats.logicalVoxelsBeforeAutopilot=sourceCount;world.stats.qualityAutopilotAddedVoxels=additions.length;world.stats.logicalVoxels=enhanced.length}
  return world;
}
module.exports={enhanceVoxelWorld,frontProjection,sameFrontProjection,readPolicy};
