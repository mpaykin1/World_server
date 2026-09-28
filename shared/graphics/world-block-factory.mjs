// World Block Factory: deterministic CPU-first core
export const FACTORY_VERSION=1;
export const CHUNK_SIZE=16;
export const QUALITY=['PROCEDURAL','PROCEDURAL_APNG','HYBRID','GLB_FX'];
const define=(color,biomes,sockets=[],capabilities=[],footprint=[1,1])=>({color,biomes,sockets,capabilities,footprint,license:'Original World Server'});
export const BLOCK_TYPES=Object.freeze({
 barren:define('#917663',['wasteland']),grass:define('#749b60',['plains','forest']),
 sand:define('#d7bb80',['desert','coast']),stone:define('#8c9193',['mountain']),
 forest:define('#3b7943',['forest','plains'],['land'],['flammable','ecology'],[2,2]),
 river:define('#3b9bbd',['river','plains'],['water'],['flow']),
 volcano:define('#634741',['volcanic'],['lava'],['eruption'],[3,3]),
 city:define('#bfa587',['plains'],['road','energy'],['settlement'],[3,3]),
 energy:define('#e4c373',['plains'],['energy'],['generation'],[2,2]),
 road:define('#a39681',['plains'],['road'],['transport']),
 villager:define('#cca47f',['wasteland','plains'],['road'],['resident']),
 steam:define('#e5ece5',['river'],[],['fx']),
 burnt_forest:define('#53483c',['forest'],[],['regrowth'],[2,2])
});
const valid=n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000;
export const chunkOf=(x,z)=>({cx:Math.floor(x/CHUNK_SIZE),cz:Math.floor(z/CHUNK_SIZE)});
export function hash32(seed,x,z){let h=(seed|0)^Math.imul(x,374761393)^Math.imul(z,668265263);h=Math.imul(h^(h>>>13),1274126177);return(h^(h>>>16))>>>0;}
export function terrainAt(seed,x,z){const a=hash32(seed,Math.floor(x/5),Math.floor(z/5))%101,b=hash32(seed+17,x,z)%100;return a>87&&b>33?'stone':a<12&&b>51?'sand':'barren';}
export function generateChunk(seed,cx,cz){
 if(!valid(cx)||!valid(cz))throw Error('Invalid chunk');
 const tiles=[];for(let z=0;z<CHUNK_SIZE;z++)for(let x=0;x<CHUNK_SIZE;x++)tiles.push(terrainAt(seed,cx*CHUNK_SIZE+x,cz*CHUNK_SIZE+z));
 return {key:cx+','+cz,cx,cz,size:CHUNK_SIZE,tiles};
}
export function createFactoryWorld(seed=270927,world_id='chain-main'){
 if(!valid(seed)||!(/^[a-z0-9-]{1,64}$/).test(world_id))throw Error('Invalid world');
 const world={version:FACTORY_VERSION,world_id,seed,turn:0,nextId:1,blocks:[],events:[]};
 for(const [x,z] of [[-2,0],[0,2],[3,-1]])placeBlock(world,'villager',x,z);
 return world;
}
export function placeBlock(world,type,x,z,visible=null){
 if(!BLOCK_TYPES[type]||!valid(x)||!valid(z))throw Error('Invalid block');
 if(visible&&!isVisibleTile(x,z,visible))throw Error('Outside visible area');
 if(type!=='villager'&&world.blocks.some(b=>b.x===x&&b.z===z&&b.type!=='villager'))throw Error('Tile occupied');
 const spec=BLOCK_TYPES[type],id='blk-'+world.nextId++;
 const b={id,type,version:1,x,z,anchor:[0,0],size:[1,1,1],footprint:[...spec.footprint],biomes:[...spec.biomes],seed:hash32(world.seed,x,z),quality:QUALITY[0],lod:0,mobileMaxLod:1,state:{},asset:{origin:'World Server',license:spec.license}};
 world.blocks.push(b);world.events.push({id:'evt-'+world.events.length,type:'placed',blockId:id,turn:world.turn,x,z});return b;
}
export function upgradeBlock(world,id,quality){
 if(!QUALITY.includes(quality))throw Error('Unknown quality');
 const b=world.blocks.find(item=>item.id===id);if(!b)throw Error('Unknown block');
 b.quality=quality;return b;
}
export function connectedMask(world,b,port){
 const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
 return dirs.reduce((mask,[dx,dz],i)=>world.blocks.some(other=>other.x===b.x+dx&&other.z===b.z+dz&&BLOCK_TYPES[other.type]?.sockets.includes(port))?mask|(1<<i):mask,0);
}
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.z-b.z);
function effect(world,type,volcano,b){
 const effectId=type+':'+volcano.id+':'+b.id;
 if(world.events.some(e=>e.effectId===effectId))return;
 world.events.push({id:'evt-'+world.events.length,effectId,type,source:volcano.id,blockId:b.id,x:b.x,z:b.z,turn:world.turn});
}
export function tickFactoryWorld(world){
 world.turn++;
 for(const volcano of world.blocks.filter(b=>b.type==='volcano')){
  volcano.state.lavaReach=Math.min(12,(volcano.state.lavaReach||0)+1);
  for(const b of world.blocks){
   if(dist(volcano,b)>volcano.state.lavaReach||dist(volcano,b)>12)continue;
   if(b.type==='river')effect(world,'steam',volcano,b);
   if(b.type==='forest'){b.type='burnt_forest';b.state.burntAt=world.turn;effect(world,'forest_burned',volcano,b);}
   if(b.type==='villager'&&!b.state.evacuated){b.state.evacuated=true;effect(world,'resident_evacuated',volcano,b);}
  }
 }
 return world.events.filter(e=>e.turn===world.turn);
}
export function serializeFactoryWorld(world){return JSON.stringify(world);}
export function restoreFactoryWorld(raw){
 let world;try{world=JSON.parse(raw);}catch{return null;}
 if(!world||world.version!==FACTORY_VERSION||!valid(world.seed)||!(/^[a-z0-9-]{1,64}$/).test(world.world_id)||!valid(world.turn)||!valid(world.nextId)||!Array.isArray(world.blocks)||world.blocks.length>100000||!Array.isArray(world.events)||world.events.length>200000)return null;
 const ids=new Set();
 for(const b of world.blocks){if(!BLOCK_TYPES[b.type]||!valid(b.x)||!valid(b.z)||typeof b.id!=='string'||ids.has(b.id))return null;ids.add(b.id);}
 return world;
}
export function worldToScreen(x,z,camera,w,h,tw=58,th=29){const dx=x-camera.x,dz=z-camera.z;return{x:w/2+(dx-dz)*tw/2,y:h/2+(dx+dz)*th/2};}
export function screenToWorld(sx,sy,camera,w,h,tw=58,th=29){const u=(sx-w/2)/tw,v=(sy-h/2)/th;return{x:Math.floor(camera.x+u+v+.5),z:Math.floor(camera.z+v-u+.5)};}
export function viewportBounds(camera,w,h,tw=58,th=29){
 const pts=[[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>screenToWorld(x,y,camera,w,h,tw,th));
 return{minX:Math.min(...pts.map(p=>p.x))-2,maxX:Math.max(...pts.map(p=>p.x))+2,minZ:Math.min(...pts.map(p=>p.z))-2,maxZ:Math.max(...pts.map(p=>p.z))+2};
}
export function isVisibleTile(x,z,b){return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;}
export function visibleChunks(b,buffer=1){
 const low=chunkOf(b.minX,b.minZ),high=chunkOf(b.maxX,b.maxZ),out=[];
 for(let cz=low.cz-buffer;cz<=high.cz+buffer;cz++)for(let cx=low.cx-buffer;cx<=high.cx+buffer;cx++)out.push([cx,cz]);
 return out;
}
