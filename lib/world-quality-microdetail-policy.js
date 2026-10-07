'use strict';
const path=require('path');
const POLICY=require(path.join('..','shared','microdetail-policy.json'));

function clamp(v,a,b){return Math.max(a,Math.min(b,Number(v)||0));}
function tierIndex(name){return POLICY.tierOrder.indexOf(name);}
function profileFor(name='default'){return POLICY.profiles[name]||POLICY.profiles.default;}
function tierFor(name='BALANCED'){return POLICY.tiers[name]||POLICY.tiers.BALANCED;}
function semanticFromBlock(blockType){return POLICY.blockSemantic[String(blockType)]||'default';}
function clampTierToCeiling(active,ceiling){
  const ai=tierIndex(active),ci=tierIndex(ceiling);
  if(ai<0)return ci>=0?ceiling:'BALANCED';
  if(ci<0)return active;
  return ai>ci?ceiling:active;
}
function inferSemanticFromName(name=''){
  const s=String(name).toLowerCase();
  if(/face|head|muzzle|snout|nose|lip|cheek|jaw/.test(s))return'face';
  if(/scale|dragon|rept|lizard|snake/.test(s))return'scales';
  if(/armor|plate|helmet|shield/.test(s))return'armor';
  if(/weapon|sword|axe|gun|rifle|blade|knife|bow/.test(s))return'weapon';
  if(/skin|body|hand|foot|paw/.test(s))return'skin';
  if(/fur|hair|wool/.test(s))return'fur';
  if(/bone|horn|tooth|claw/.test(s))return'bone';
  if(/cloth|fabric|shirt|pants|coat|robe/.test(s))return'fabric';
  if(/wood|tree|plank/.test(s))return'wood';
  if(/metal|iron|steel/.test(s))return'metal';
  if(/stone|rock/.test(s))return'stone';
  if(/brick|masonry/.test(s))return'brick';
  return'default';
}
function hexRgb(hex){
  const n=parseInt(String(hex).replace('#',''),16)||0;
  return[(n>>16)&255,(n>>8)&255,n&255];
}
function colorSemantic(rgb){
  if(!Array.isArray(rgb)||rgb.length<3)return'default';
  const r=clamp(rgb[0],0,255),g=clamp(rgb[1],0,255),b=clamp(rgb[2],0,255);
  if(r>175&&g>105&&g<210&&b>70&&b<185&&r>g&&g>b)return'skin';
  let best='default',bestD=Infinity;
  for(const entry of POLICY.knownColors){
    const [er,eg,eb]=hexRgb(entry.hex),d=(r-er)**2+(g-eg)**2+(b-eb)**2;
    if(d<bestD){bestD=d;best=entry.semantic;}
  }
  return bestD<65*65?best:'default';
}
function inferSemantic({name='',rgb=null,metalness=0}={}){
  const byName=inferSemanticFromName(name);
  if(byName!=='default')return byName;
  if(Number(metalness)>.45)return'metal';
  return colorSemantic(rgb);
}
function selectRepresentation({semantic='default',distance=Infinity,tier='BALANCED',importance=1,exactMode=false}={}){
  if(exactMode)return'flat';
  const p=profileFor(semantic),t=tierFor(tier);
  if(!p.density||!p.amplitude)return'flat';
  const d=t.geometryDistance*(.78+.42*clamp(importance,0,1.5));
  if(distance<=d)return'geometry';
  if(distance<=d*4)return'shader';
  return'flat';
}
function validatePolicy(){
  const errors=[];
  if(POLICY.schemaVersion!=='2.0.0')errors.push('schemaVersion');
  for(const name of POLICY.tierOrder)if(!POLICY.tiers[name])errors.push(`missing tier ${name}`);
  for(const [name,p] of Object.entries(POLICY.profiles)){
    if(p.density<0||p.density>1)errors.push(`${name}:density`);
    if(p.amplitude<0||p.amplitude>POLICY.guards.maxAmplitude)errors.push(`${name}:amplitude`);
    if(p.grid<3||p.grid>6)errors.push(`${name}:grid`);
  }
  const d=POLICY.tierOrder.map(n=>POLICY.tiers[n].geometryDistance);
  for(let i=1;i<d.length;i++)if(d[i]<=d[i-1])errors.push('geometryDistance monotonic');
  const f=POLICY.tierOrder.map(n=>POLICY.tiers[n].maxDetailedFacesPerMesh);
  for(let i=1;i<f.length;i++)if(f[i]<f[i-1])errors.push('face budget monotonic');
  if(profileFor('face').amplitude>=profileFor('skin').amplitude)errors.push('face must be subtler than skin');
  if(profileFor('skin').amplitude>=profileFor('scales').amplitude)errors.push('skin must be subtler than scales');
  if(profileFor('smooth').density!==0||profileFor('smooth').amplitude!==0)errors.push('smooth must stay flat');
  if(POLICY.guards.collisionAgnostic!==true)errors.push('collisionAgnostic guard');
  if(POLICY.guards.orthographicExactMode!==true)errors.push('orthographicExactMode guard');
  return{ok:errors.length===0,errors};
}

module.exports={
  POLICY,profileFor,tierFor,tierIndex,clampTierToCeiling,
  semanticFromBlock,inferSemanticFromName,colorSemantic,inferSemantic,
  selectRepresentation,validatePolicy
};
