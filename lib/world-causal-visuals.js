'use strict';
// Deterministic, render-agnostic visual contract. No GPU, network or paid API.
// A visual request is NOT evidence that an effect is actually visible in-game.
const EFFECTS = Object.freeze({
  eruption: {asset:'volcanic-ash', zone:'ash_field', mode:'billboard', fps:6, priority:3},
  lava_wall_contact: {asset:'lava-steam', zone:'wall_contact', mode:'billboard', fps:8, priority:5},
  lava_diverted: {asset:'lava-embers', zone:'diversion', mode:'billboard', fps:8, priority:4},
  villagers_build_wall: {asset:'builder-dust', zone:'construction', mode:'billboard', fps:6, priority:2},
  river_flow: {asset:'river-ripple', zone:'wetland', mode:'billboard', fps:4, priority:1}
});
function finiteCoord(n) { return Number.isFinite(n) && Math.abs(n) <= 1e7; }
function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || !Object.hasOwn(EFFECTS,event.kind)) return null;
  if (typeof event.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,96}$/.test(event.id)) return null;
  const p=event.position;
  if (!p || !finiteCoord(p.x) || !finiteCoord(p.y) || !finiteCoord(p.z)) return null;
  const revision=event.revision;
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  return {id:event.id,kind:event.kind,position:{x:p.x,y:p.y,z:p.z},revision};
}
function planCausalVisuals(events, options={}) {
  const maxSprites=Number.isSafeInteger(options.maxSprites)?Math.max(0,Math.min(256,options.maxSprites)):24;
  const chunkSize=Number.isSafeInteger(options.chunkSize)&&options.chunkSize>0&&options.chunkSize<=1024?options.chunkSize:16;
  const inventory=new Set(Array.isArray(options.inventory)?options.inventory:[]);
  const seen=new Set();
  const normalized=[];
  for(const raw of Array.isArray(events)?events:[]) {
    const event=normalizeEvent(raw);
    if (!event || seen.has(event.id)) continue;
    seen.add(event.id);normalized.push(event);
  }
  normalized.sort((a,b)=>b.revision-a.revision || EFFECTS[b.kind].priority-EFFECTS[a.kind].priority || a.id.localeCompare(b.id));
  const requests=[],missingAssets=[],dirtyChunks=new Set();
  for(const event of normalized) {
    const effect=EFFECTS[event.kind];
    const chunk={x:Math.floor(event.position.x/chunkSize),z:Math.floor(event.position.z/chunkSize)};
    dirtyChunks.add(chunk.x+':'+chunk.z);
    if(requests.length>=maxSprites) continue;
    const request={eventId:event.id,revision:event.revision,kind:event.kind,asset:effect.asset,
      zone:effect.zone,position:event.position,chunk,mode:effect.mode,fps:effect.fps,
      frameCount:4,deterministicKey:event.id+':'+event.revision+':'+effect.asset};
    if(inventory.has(effect.asset)) requests.push(request);
    else missingAssets.push({...request,reason:'asset_not_in_inventory'});
  }
  return {schemaVersion:1,requests,missingAssets,dirtyChunks:[...dirtyChunks].sort(),
    budget:{maxSprites,scheduled:requests.length},automaticPlacement:false,
    integrationRequired:'Renderer must load atlas, place billboard at event.position, animate frames and verify real desktop/mobile screenshots'};
}
module.exports={EFFECTS,normalizeEvent,planCausalVisuals};
