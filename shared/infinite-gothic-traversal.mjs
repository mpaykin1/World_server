// Deterministic infinite Gothic traversal grammar.
// One canonical topology feeds both rendering and walkability so bridges,
// arched building corridors and movement cannot silently diverge.

export const INFINITE_GOTHIC_VERSION=1;
export const CELL_SIZE=28;
export const BUILDING_HALF=7;
export const CORRIDOR_HALF=2;
export const DECK_Y=-1;

const BLOCK=Object.freeze({STONE:3,WOOD:5,GLASS:9,BRICK:10,IRON:13});
const DIRS=Object.freeze({
  north:{dx:0,dz:-1,axis:'z',sign:-1,opposite:'south'},
  east:{dx:1,dz:0,axis:'x',sign:1,opposite:'west'},
  south:{dx:0,dz:1,axis:'z',sign:1,opposite:'north'},
  west:{dx:-1,dz:0,axis:'x',sign:-1,opposite:'east'},
});
export const DIRECTIONS=Object.freeze(Object.keys(DIRS));

const clampInt=(v,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(v)||min)));
const key3=(x,y,z)=>`${x},${y},${z}`;
const cellKey=(cx,cz)=>`${cx},${cz}`;

function hash32(text){
  let h=2166136261>>>0;
  for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  h^=h>>>16;h=Math.imul(h,0x7feb352d)>>>0;h^=h>>>15;h=Math.imul(h,0x846ca68b)>>>0;h^=h>>>16;
  return h>>>0;
}
function unit(seed,label){return hash32(`${seed}|${label}`)/4294967295;}
function add(map,x,y,z,blockType,role,structureId){
  const k=key3(x,y,z);
  if(!map.has(k))map.set(k,{x,y,z,blockType,role,structureId});
}
function centeredMod(value,size){
  const half=size/2;
  return ((Number(value)+half)%size+size)%size-half;
}
function pointedArchOpen(offset,y){
  const a=Math.abs(offset);
  if(y<=3)return a<=CORRIDOR_HALF;
  if(y===4)return a<=1;
  if(y===5)return a===0;
  return false;
}
function isPortalOpening(faceCoord,y){
  return pointedArchOpen(faceCoord,y);
}
function canonicalPair(a,b){
  return (a.cx<b.cx||(a.cx===b.cx&&a.cz<=b.cz))?[a,b]:[b,a];
}

export function worldSeedValue(seed='world-server-gothic'){
  return hash32(String(seed));
}
export function cellId(cx,cz){return cellKey(Math.trunc(cx),Math.trunc(cz));}
export function worldToCell(x,z){
  return {cx:Math.floor((Number(x)+CELL_SIZE/2)/CELL_SIZE),cz:Math.floor((Number(z)+CELL_SIZE/2)/CELL_SIZE)};
}
export function cellCenter(cx,cz){return{x:Math.trunc(cx)*CELL_SIZE,y:0,z:Math.trunc(cz)*CELL_SIZE};}
export function neighborCell(cx,cz,direction){
  const d=DIRS[direction];if(!d)throw new RangeError(`Unknown direction: ${direction}`);
  return{cx:Math.trunc(cx)+d.dx,cz:Math.trunc(cz)+d.dz};
}
export function edgeId(a,b){
  const [p,q]=canonicalPair(a,b);
  const manhattan=Math.abs(p.cx-q.cx)+Math.abs(p.cz-q.cz);
  if(manhattan!==1)throw new RangeError('Traversal edges require cardinal neighboring cells');
  return`${cellKey(p.cx,p.cz)}>${cellKey(q.cx,q.cz)}`;
}
export function edgeBetween(cx,cz,direction){
  const a={cx:Math.trunc(cx),cz:Math.trunc(cz)},b=neighborCell(cx,cz,direction);
  return{id:edgeId(a,b),a,b,direction};
}

export function portalFor(cx,cz,direction){
  const d=DIRS[direction];if(!d)throw new RangeError(`Unknown direction: ${direction}`);
  const c=cellCenter(cx,cz);
  return{
    direction,
    x:c.x+(d.axis==='x'?d.sign*BUILDING_HALF:0),
    y:0,
    z:c.z+(d.axis==='z'?d.sign*BUILDING_HALF:0),
    width:CORRIDOR_HALF*2+1,
    neighbor:neighborCell(cx,cz,direction),
  };
}

function addCorridorFloor(map,c,structureId){
  for(let x=-BUILDING_HALF;x<=BUILDING_HALF;x++)for(let z=-CORRIDOR_HALF;z<=CORRIDOR_HALF;z++){
    add(map,c.x+x,DECK_Y,c.z+z,BLOCK.STONE,'corridor-floor',structureId);
  }
  for(let z=-BUILDING_HALF;z<=BUILDING_HALF;z++)for(let x=-CORRIDOR_HALF;x<=CORRIDOR_HALF;x++){
    add(map,c.x+x,DECK_Y,c.z+z,BLOCK.STONE,'corridor-floor',structureId);
  }
}
function addBuildingShell(map,c,height,structureId){
  for(let y=0;y<=height;y++){
    for(let a=-BUILDING_HALF;a<=BUILDING_HALF;a++){
      if(!isPortalOpening(a,y)){
        add(map,c.x+a,y,c.z-BUILDING_HALF,BLOCK.BRICK,y<=5?'arch-wall':'wall',structureId);
        add(map,c.x+a,y,c.z+BUILDING_HALF,BLOCK.BRICK,y<=5?'arch-wall':'wall',structureId);
        add(map,c.x-BUILDING_HALF,y,c.z+a,BLOCK.BRICK,y<=5?'arch-wall':'wall',structureId);
        add(map,c.x+BUILDING_HALF,y,c.z+a,BLOCK.BRICK,y<=5?'arch-wall':'wall',structureId);
      }
    }
  }
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=c.x+sx*BUILDING_HALF,z=c.z+sz*BUILDING_HALF;
    for(let y=0;y<=height+2;y++)add(map,x,y,z,BLOCK.STONE,'pier',structureId);
  }
}
function addArchCrowns(map,c,structureId){
  for(const direction of DIRECTIONS){
    const p=portalFor(c.x/CELL_SIZE,c.z/CELL_SIZE,direction);
    const d=DIRS[direction];
    for(let a=-3;a<=3;a++){
      const rise=3-Math.abs(a);
      const y=4+rise;
      const x=d.axis==='z'?p.x+a:p.x;
      const z=d.axis==='x'?p.z+a:p.z;
      add(map,x,y,z,BLOCK.STONE,'pointed-arch',structureId);
    }
  }
}
function addWindows(map,c,height,seed,structureId){
  const y0=Math.max(7,Math.floor(height*.52));
  const faces=[
    {axis:'z',fixed:c.z-BUILDING_HALF},
    {axis:'z',fixed:c.z+BUILDING_HALF},
    {axis:'x',fixed:c.x-BUILDING_HALF},
    {axis:'x',fixed:c.x+BUILDING_HALF},
  ];
  for(let fi=0;fi<faces.length;fi++){
    const face=faces[fi];
    const offset=(unit(seed,`window-${fi}`)>.5?3:-3);
    for(const [a,dy] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]){
      const x=face.axis==='z'?c.x+offset+a:face.fixed;
      const z=face.axis==='x'?c.z+offset+a:face.fixed;
      add(map,x,y0+dy,z,BLOCK.GLASS,'window',structureId);
    }
  }
}
function addRoof(map,c,height,seed,structureId){
  const roofY=height+1;
  for(let x=-BUILDING_HALF;x<=BUILDING_HALF;x++)for(let z=-BUILDING_HALF;z<=BUILDING_HALF;z++){
    if(Math.max(Math.abs(x),Math.abs(z))>=BUILDING_HALF-1)add(map,c.x+x,roofY,c.z+z,BLOCK.STONE,'roof',structureId);
  }
  const spireHeight=4+Math.floor(unit(seed,'spire')*5);
  for(let y=0;y<spireHeight;y++){
    const r=Math.max(0,Math.floor((spireHeight-y-1)/2));
    for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)add(map,c.x+x,roofY+1+y,c.z+z,y===spireHeight-1?BLOCK.IRON:BLOCK.STONE,'spire',structureId);
  }
}
function addButtresses(map,c,height,seed,structureId){
  const mid=Math.max(4,Math.floor(height*.45));
  for(const dir of DIRECTIONS){
    const d=DIRS[dir],side=unit(seed,`buttress-${dir}`)>.5?1:-1;
    for(let y=0;y<=mid;y++){
      const taper=Math.floor(y/4);
      const lateral=(BUILDING_HALF+1+Math.max(0,2-taper))*d.sign;
      const x=d.axis==='x'?c.x+lateral:c.x+side*(BUILDING_HALF-2);
      const z=d.axis==='z'?c.z+lateral:c.z+side*(BUILDING_HALF-2);
      add(map,x,y,z,BLOCK.STONE,'buttress',structureId);
    }
  }
}

export function buildTraversalCell(options={}){
  const cx=Math.trunc(Number(options.cx)||0),cz=Math.trunc(Number(options.cz)||0);
  const worldSeed=worldSeedValue(options.seed);
  const seed=hash32(`${worldSeed}|${cx}|${cz}`);
  const c=cellCenter(cx,cz);
  const height=11+Math.floor(unit(seed,'height')*8);
  const structureId=`gothic-node-${cx}-${cz}`;
  const map=new Map();
  addCorridorFloor(map,c,structureId);
  addBuildingShell(map,c,height,structureId);
  addArchCrowns(map,c,structureId);
  addWindows(map,c,height,seed,structureId);
  addRoof(map,c,height,seed,structureId);
  addButtresses(map,c,height,seed,structureId);
  const portals=Object.fromEntries(DIRECTIONS.map(d=>[d,portalFor(cx,cz,d)]));
  return{
    schemaVersion:INFINITE_GOTHIC_VERSION,
    kind:'gothic-traversal-cell',
    id:cellId(cx,cz),cx,cz,center:c,seed,height,
    portals,
    voxels:[...map.values()].sort((a,b)=>a.y-b.y||a.x-b.x||a.z-b.z||a.blockType-b.blockType),
  };
}

function edgeAxis(a,b){
  if(a.cx!==b.cx)return'x';
  if(a.cz!==b.cz)return'z';
  throw new RangeError('Edge endpoints must differ');
}
function addBridgeDeck(map,a,b,structureId){
  const ca=cellCenter(a.cx,a.cz),cb=cellCenter(b.cx,b.cz),axis=edgeAxis(a,b);
  if(axis==='x'){
    const min=Math.min(ca.x,cb.x)+BUILDING_HALF,max=Math.max(ca.x,cb.x)-BUILDING_HALF;
    for(let x=min;x<=max;x++)for(let z=-CORRIDOR_HALF;z<=CORRIDOR_HALF;z++)add(map,x,DECK_Y,ca.z+z,BLOCK.STONE,'bridge-deck',structureId);
  }else{
    const min=Math.min(ca.z,cb.z)+BUILDING_HALF,max=Math.max(ca.z,cb.z)-BUILDING_HALF;
    for(let z=min;z<=max;z++)for(let x=-CORRIDOR_HALF;x<=CORRIDOR_HALF;x++)add(map,ca.x+x,DECK_Y,z,BLOCK.STONE,'bridge-deck',structureId);
  }
}
function addBridgeParapets(map,a,b,style,structureId){
  const ca=cellCenter(a.cx,a.cz),cb=cellCenter(b.cx,b.cz),axis=edgeAxis(a,b),outer=CORRIDOR_HALF+1;
  const covered=style==='covered';
  if(axis==='x'){
    const min=Math.min(ca.x,cb.x)+BUILDING_HALF+1,max=Math.max(ca.x,cb.x)-BUILDING_HALF-1;
    for(let x=min;x<=max;x++){
      add(map,x,0,ca.z-outer,BLOCK.BRICK,'parapet',structureId);add(map,x,0,ca.z+outer,BLOCK.BRICK,'parapet',structureId);
      if(covered&&((x-min)%4===0)){
        for(let y=1;y<=5;y++){add(map,x,y,ca.z-outer,BLOCK.STONE,'bridge-column',structureId);add(map,x,y,ca.z+outer,BLOCK.STONE,'bridge-column',structureId);}
        for(let z=-outer;z<=outer;z++)add(map,x,6,ca.z+z,BLOCK.STONE,'bridge-roof',structureId);
      }
    }
  }else{
    const min=Math.min(ca.z,cb.z)+BUILDING_HALF+1,max=Math.max(ca.z,cb.z)-BUILDING_HALF-1;
    for(let z=min;z<=max;z++){
      add(map,ca.x-outer,0,z,BLOCK.BRICK,'parapet',structureId);add(map,ca.x+outer,0,z,BLOCK.BRICK,'parapet',structureId);
      if(covered&&((z-min)%4===0)){
        for(let y=1;y<=5;y++){add(map,ca.x-outer,y,z,BLOCK.STONE,'bridge-column',structureId);add(map,ca.x+outer,y,z,BLOCK.STONE,'bridge-column',structureId);}
        for(let x=-outer;x<=outer;x++)add(map,ca.x+x,6,z,BLOCK.STONE,'bridge-roof',structureId);
      }
    }
  }
}
function addBridgeSupports(map,a,b,style,structureId){
  if(style==='plain')return;
  const ca=cellCenter(a.cx,a.cz),cb=cellCenter(b.cx,b.cz),axis=edgeAxis(a,b);
  const center=axis==='x'?Math.round((ca.x+cb.x)/2):Math.round((ca.z+cb.z)/2);
  for(let y=-2;y>=-7;y--){
    if(axis==='x'){
      for(const z of [-CORRIDOR_HALF-1,CORRIDOR_HALF+1])add(map,center,y,ca.z+z,BLOCK.STONE,'bridge-support',structureId);
    }else{
      for(const x of [-CORRIDOR_HALF-1,CORRIDOR_HALF+1])add(map,ca.x+x,y,center,BLOCK.STONE,'bridge-support',structureId);
    }
  }
  if(style==='arcaded'){
    for(let step=-4;step<=4;step++){
      const lift=Math.max(0,4-Math.abs(step));
      if(axis==='x'){
        for(const z of [-CORRIDOR_HALF-1,CORRIDOR_HALF+1])add(map,center+step,-2-lift,ca.z+z,BLOCK.STONE,'bridge-arch',structureId);
      }else{
        for(const x of [-CORRIDOR_HALF-1,CORRIDOR_HALF+1])add(map,ca.x+x,-2-lift,center+step,BLOCK.STONE,'bridge-arch',structureId);
      }
    }
  }
}

export function buildTraversalEdge(options={}){
  const a={cx:Math.trunc(options.a?.cx),cz:Math.trunc(options.a?.cz)};
  const b={cx:Math.trunc(options.b?.cx),cz:Math.trunc(options.b?.cz)};
  const id=edgeId(a,b),worldSeed=worldSeedValue(options.seed),seed=hash32(`${worldSeed}|${id}`);
  const styles=['plain','arcaded','covered'];
  const style=styles[seed%styles.length],structureId=`gothic-edge-${id}`,map=new Map();
  addBridgeDeck(map,a,b,structureId);
  addBridgeParapets(map,a,b,style,structureId);
  addBridgeSupports(map,a,b,style,structureId);
  return{
    schemaVersion:INFINITE_GOTHIC_VERSION,
    kind:'gothic-traversal-edge',id,a,b,seed,style,
    voxels:[...map.values()].sort((x,y)=>x.y-y.y||x.x-y.x||x.z-y.z||x.blockType-y.blockType),
  };
}

export function isWalkable(x,z){
  const lx=centeredMod(x,CELL_SIZE),lz=centeredMod(z,CELL_SIZE);
  return Math.abs(lx)<=CORRIDOR_HALF+.45||Math.abs(lz)<=CORRIDOR_HALF+.45;
}
export function clampToWalkable(from,to){
  if(isWalkable(to.x,to.z))return{x:Number(to.x),z:Number(to.z),blocked:false};
  const xOnly={x:Number(to.x),z:Number(from.z)};
  if(isWalkable(xOnly.x,xOnly.z))return{...xOnly,blocked:true};
  const zOnly={x:Number(from.x),z:Number(to.z)};
  if(isWalkable(zOnly.x,zOnly.z))return{...zOnly,blocked:true};
  return{x:Number(from.x),z:Number(from.z),blocked:true};
}
export function traversalNeighbors(cx,cz){
  return Object.fromEntries(DIRECTIONS.map(d=>[d,neighborCell(cx,cz,d)]));
}

export function buildTraversalWindow(options={}){
  const centerCx=Math.trunc(Number(options.centerCx)||0),centerCz=Math.trunc(Number(options.centerCz)||0);
  const radius=clampInt(options.radius??2,1,5),seed=options.seed??'world-server-gothic';
  const cells=[],cellSet=new Set();
  for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){
    const cx=centerCx+dx,cz=centerCz+dz;
    cells.push(buildTraversalCell({cx,cz,seed}));cellSet.add(cellId(cx,cz));
  }
  const edgeMap=new Map();
  for(const cell of cells){
    for(const direction of ['east','south']){
      const n=neighborCell(cell.cx,cell.cz,direction);
      if(!cellSet.has(cellId(n.cx,n.cz)))continue;
      const edge=buildTraversalEdge({a:{cx:cell.cx,cz:cell.cz},b:n,seed});
      edgeMap.set(edge.id,edge);
    }
  }
  return{
    schemaVersion:INFINITE_GOTHIC_VERSION,
    center:{cx:centerCx,cz:centerCz},radius,seed:String(seed),
    cells:cells.sort((a,b)=>a.cz-b.cz||a.cx-b.cx),
    edges:[...edgeMap.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    bounds:{
      minCx:centerCx-radius,maxCx:centerCx+radius,
      minCz:centerCz-radius,maxCz:centerCz+radius,
    },
  };
}

export function traversalProof(options={}){
  const distance=clampInt(options.cells??64,1,10000),seed=options.seed??'world-server-gothic';
  const failures=[];
  for(const direction of DIRECTIONS){
    let cx=0,cz=0;
    for(let i=0;i<distance;i++){
      const n=neighborCell(cx,cz,direction);
      const edge=buildTraversalEdge({a:{cx,cz},b:n,seed});
      if(!edge.voxels.some(v=>v.role==='bridge-deck'))failures.push({direction,i,reason:'missing-deck'});
      const portal=portalFor(cx,cz,direction);
      const opposite=portalFor(n.cx,n.cz,DIRS[direction].opposite);
      if(direction==='east'||direction==='west'){
        if(portal.z!==opposite.z)failures.push({direction,i,reason:'portal-z-mismatch'});
      }else if(portal.x!==opposite.x)failures.push({direction,i,reason:'portal-x-mismatch'});
      cx=n.cx;cz=n.cz;
    }
  }
  return{ok:failures.length===0,cellsPerDirection:distance,seed:String(seed),failures};
}
