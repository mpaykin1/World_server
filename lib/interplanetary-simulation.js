'use strict';

const MAX_NESTING_DEPTH=3;
const MAX_CHILDREN_PER_WORLD=4;
const MAX_CPU_UNITS=1000;
const MAX_MEMORY_UNITS=1000;

function stableHash(text){
  let h=2166136261>>>0;
  for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}
  return h>>>0;
}
function boundedInt(value,min,max,name){
  if(!Number.isInteger(value)||value<min||value>max) throw new RangeError(`${name} must be an integer in [${min}, ${max}]`);
  return value;
}
function createPlanet({worldId,planetId,seed,gravity=1,atmosphere='earthlike',climate='temperate'}){
  if(!worldId||!planetId) throw new TypeError('worldId and planetId are required');
  return Object.freeze({worldId:String(worldId),planetId:String(planetId),seed:String(seed??planetId),gravity:Number(gravity),atmosphere:String(atmosphere),climate:String(climate)});
}
function adaptSpecies({speciesId,genomeSeed,planet}){
  if(!speciesId||!planet) throw new TypeError('speciesId and planet are required');
  const roll=stableHash(`${genomeSeed}|${planet.seed}|${planet.gravity}|${planet.atmosphere}|${planet.climate}`);
  return Object.freeze({speciesId:String(speciesId),genomeSeed:String(genomeSeed),adaptation:{
    gravityBand:planet.gravity<0.7?'low-g':planet.gravity>1.3?'high-g':'mid-g',
    metabolism:['slow','balanced','fast'][roll%3],
    climateTrait:['insulated','water-saving','heat-dispersing'][(roll>>>8)%3]
  }});
}
function createNestedWorld({parent,worldId,seed,lawVersion='1',cpuUnits=100,memoryUnits=100}){
  if(!parent?.worldId||!worldId) throw new TypeError('parent.worldId and worldId are required');
  const depth=boundedInt((parent.depth??0)+1,1,MAX_NESTING_DEPTH,'depth');
  const children=Array.isArray(parent.childWorldIds)?parent.childWorldIds:[];
  if(children.length>=MAX_CHILDREN_PER_WORLD) throw new RangeError('parent child-world limit reached');
  boundedInt(cpuUnits,1,MAX_CPU_UNITS,'cpuUnits');
  boundedInt(memoryUnits,1,MAX_MEMORY_UNITS,'memoryUnits');
  return Object.freeze({worldId:String(worldId),parentWorldId:String(parent.worldId),depth,seed:String(seed??worldId),lawVersion:String(lawVersion),limits:Object.freeze({cpuUnits,memoryUnits}),childWorldIds:Object.freeze([]),interventions:Object.freeze([])});
}
function createInGameMessage({childWorld,groupId,anomalyId,message}){
  if(!childWorld?.parentWorldId) throw new TypeError('message requires a nested child world');
  if(!groupId||!anomalyId||!message) throw new TypeError('groupId, anomalyId and message are required');
  const id=`nested-msg-${stableHash(`${childWorld.seed}|${groupId}|${anomalyId}|${message}`).toString(16)}`;
  return Object.freeze({id,type:'nested_simulation_message',sourceWorldId:childWorld.worldId,targetWorldId:childWorld.parentWorldId,payload:Object.freeze({groupId:String(groupId),anomalyId:String(anomalyId),message:String(message)})});
}
function outcomeIntents({event,creatorPolicy='negotiate'}){
  if(event?.type!=='nested_simulation_message') throw new TypeError('nested simulation message required');
  if(!['negotiate','isolate'].includes(creatorPolicy)) throw new RangeError('unsupported creator policy');
  const common={sourceEventId:event.id,worldId:event.sourceWorldId};
  return creatorPolicy==='negotiate'
    ?Object.freeze([Object.freeze({...common,type:'diplomacy_opened',delayTicks:2,resourceCost:{compute:10}}),Object.freeze({...common,type:'autonomy_pressure',delayTicks:5,delta:{trust:8,stability:-2}})])
    :Object.freeze([Object.freeze({...common,type:'information_boundary_tightened',delayTicks:1,resourceCost:{compute:5}}),Object.freeze({...common,type:'autonomy_pressure',delayTicks:4,delta:{trust:-10,stability:-5}})]);
}
module.exports={MAX_NESTING_DEPTH,MAX_CHILDREN_PER_WORLD,MAX_CPU_UNITS,MAX_MEMORY_UNITS,stableHash,createPlanet,adaptSpecies,createNestedWorld,createInGameMessage,outcomeIntents};
