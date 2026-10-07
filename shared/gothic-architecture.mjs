// Deterministic Gothic voxel primitives for structural gameplay.
export const GOTHIC_STRUCTURE_VERSION = 1;

const BLOCK = Object.freeze({
  STONE: 3,
  WOOD: 5,
  GLASS: 9,
  BRICK: 10,
  IRON: 13,
});

const clampInt = (value, min, max) => Math.max(min, Math.min(max, Math.round(Number(value) || min)));
const key3 = (x, y, z) => `${x},${y},${z}`;

const ROLE_PRIORITY = Object.freeze({
  foundation: 50,
  pier: 40,
  arch: 30,
  roof: 20,
  spire: 20,
  wall: 10,
  window: 15,
  deck: 18,
});

function addVoxel(map, x, y, z, blockType, role, structureId) {
  const k = key3(x, y, z);
  const next = { x, y, z, blockType, role, structureId };
  const current = map.get(k);
  if (!current || (ROLE_PRIORITY[role] || 0) > (ROLE_PRIORITY[current.role] || 0)) map.set(k, next);
}

function addFoundation(map, o, half, structureId) {
  const corners = [[-half,-half],[-half,half],[half,-half],[half,half]];
  for (const [dx,dz] of corners) {
    addVoxel(map, o.x + dx, o.y, o.z + dz, BLOCK.STONE, 'foundation', structureId);
  }
}

function addPiers(map, o, half, height, structureId) {
  const corners = [[-half,-half],[-half,half],[half,-half],[half,half]];
  for (const [dx,dz] of corners) {
    for (let y = 1; y <= height; y++) {
      addVoxel(map, o.x + dx, o.y + y, o.z + dz, BLOCK.STONE, 'pier', structureId);
    }
  }
}

function pointedDoorOpen(x, y, half) {
  if (y <= 3 && Math.abs(x) <= 1) return true;
  if (y === 4 && x === 0) return true;
  return false;
}

function addWallsAndArches(map, o, half, height, structureId) {
  for (let y = 1; y <= height; y++) {
    for (let a = -half; a <= half; a++) {
      const frontRole = y <= 5 && Math.abs(a) <= 2 ? 'arch' : 'wall';
      if (!pointedDoorOpen(a, y, half)) {
        addVoxel(map, o.x + a, o.y + y, o.z - half, BLOCK.BRICK, frontRole, structureId);
      }
      addVoxel(map, o.x + a, o.y + y, o.z + half, BLOCK.BRICK, 'wall', structureId);
      addVoxel(map, o.x - half, o.y + y, o.z + a, BLOCK.BRICK, 'wall', structureId);
      addVoxel(map, o.x + half, o.y + y, o.z + a, BLOCK.BRICK, 'wall', structureId);
    }
  }
  const archY = o.y + 4;
  for (const dx of [-2,-1,0,1,2]) {
    const lift = 2 - Math.abs(dx);
    addVoxel(map, o.x + dx, archY + lift, o.z - half, BLOCK.STONE, 'arch', structureId);
  }
}

function addRoofAndSpire(map, o, half, height, structureId, seed) {
  const roofY = o.y + height + 1;
  for (let x = -half; x <= half; x++) {
    for (let z = -half; z <= half; z++) {
      if (Math.max(Math.abs(x), Math.abs(z)) >= half - 1) {
        addVoxel(map, o.x + x, roofY, o.z + z, BLOCK.STONE, 'roof', structureId);
      }
    }
  }
  const spireHeight = 5 + (Math.abs(seed) % 3);
  for (let y = 0; y < spireHeight; y++) {
    const r = Math.max(0, Math.floor((spireHeight - y - 1) / 2));
    for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      addVoxel(map, o.x + x, roofY + 1 + y, o.z + z, y === spireHeight - 1 ? BLOCK.IRON : BLOCK.STONE, 'spire', structureId);
    }
  }
}

function addRoseWindow(map, o, half, height, structureId) {
  const cy = o.y + Math.max(6, Math.floor(height * 0.63));
  const z = o.z - half;
  for (const [dx,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
    addVoxel(map, o.x + dx, cy + dy, z, BLOCK.GLASS, 'window', structureId);
  }
}

export function buildGothicTower(options = {}) {
  const origin = {
    x: Math.round(Number(options.origin?.x) || 0),
    y: Math.round(Number(options.origin?.y) || 0),
    z: Math.round(Number(options.origin?.z) || 0),
  };
  const width = clampInt(options.width ?? 7, 5, 13) | 1;
  const height = clampInt(options.height ?? 14, 8, 40);
  const seed = Math.trunc(Number(options.seed) || 1);
  const half = Math.floor(width / 2);
  const structureId = String(options.structureId || `gothic-tower-${seed}`);
  const map = new Map();

  addFoundation(map, origin, half, structureId);
  addPiers(map, origin, half, height, structureId);
  addWallsAndArches(map, origin, half, height, structureId);
  addRoseWindow(map, origin, half, height, structureId);
  addRoofAndSpire(map, origin, half, height, structureId, seed);

  const voxels = [...map.values()].sort((a,b) => a.y-b.y || a.x-b.x || a.z-b.z || a.blockType-b.blockType);
  return {
    schemaVersion: GOTHIC_STRUCTURE_VERSION,
    kind: 'gothic-tower',
    structureId,
    origin,
    width,
    height,
    seed,
    voxels,
  };
}


function viaductPierXs(originX,spanCount,spacing){
  const total=spanCount*spacing;
  const start=originX-Math.round(total/2);
  return Array.from({length:spanCount+1},(_,i)=>start+i*spacing);
}

function addViaductPier(map,o,x,deckY,halfWidth,structureId){
  for(let z=-halfWidth;z<=halfWidth;z++){
    addVoxel(map,x,o.y,o.z+z,BLOCK.STONE,'foundation',structureId);
    for(let y=1;y<deckY;y++)addVoxel(map,x,o.y+y,o.z+z,BLOCK.STONE,'pier',structureId);
  }
}

function addViaductArch(map,o,left,right,deckY,halfWidth,structureId){
  const span=Math.max(2,right-left);
  for(let x=left+1;x<right;x++){
    const t=(x-left)/span*2-1;
    const rise=Math.max(1,Math.round((1-t*t)*Math.max(2,deckY-3)));
    const curveY=o.y+2+rise;
    for(let y=curveY;y<o.y+deckY;y++){
      addVoxel(map,x,y,o.z-halfWidth,BLOCK.STONE,'arch',structureId);
      addVoxel(map,x,y,o.z+halfWidth,BLOCK.STONE,'arch',structureId);
    }
  }
}

export function buildGothicViaduct(options = {}) {
  const origin={
    x:Math.round(Number(options.origin?.x)||0),
    y:Math.round(Number(options.origin?.y)||0),
    z:Math.round(Number(options.origin?.z)||0),
  };
  const spanCount=clampInt(options.spanCount??4,2,12);
  const spacing=clampInt(options.pierSpacing??8,5,14);
  const deckY=clampInt(options.deckY??9,6,24);
  const halfWidth=clampInt(options.halfWidth??1,1,3);
  const seed=Math.trunc(Number(options.seed)||1);
  const structureId=String(options.structureId||`gothic-viaduct-${seed}`);
  const map=new Map(),pierXs=viaductPierXs(origin.x,spanCount,spacing);
  for(const x of pierXs)addViaductPier(map,origin,x,deckY,halfWidth,structureId);
  for(let i=0;i<pierXs.length-1;i++)addViaductArch(map,origin,pierXs[i],pierXs[i+1],deckY,halfWidth,structureId);
  for(let x=pierXs[0];x<=pierXs.at(-1);x++){
    for(let z=-halfWidth;z<=halfWidth;z++)addVoxel(map,x,origin.y+deckY,origin.z+z,BLOCK.STONE,'deck',structureId);
    addVoxel(map,x,origin.y+deckY+1,origin.z-halfWidth,BLOCK.BRICK,'wall',structureId);
    addVoxel(map,x,origin.y+deckY+1,origin.z+halfWidth,BLOCK.BRICK,'wall',structureId);
  }
  const voxels=[...map.values()].sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z||a.blockType-b.blockType);
  return {schemaVersion:GOTHIC_STRUCTURE_VERSION,kind:'gothic-viaduct',structureId,origin,seed,spanCount,pierSpacing:spacing,deckY,halfWidth,pierXs,voxels};
}
