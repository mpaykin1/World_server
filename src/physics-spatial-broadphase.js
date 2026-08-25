function key(x,y,z){return `${x}|${y}|${z}`}
export class SpatialHashBroadphase{
  constructor({cellSize=12,nearRadius=50,sleepDelaySec=2}={}){this.cellSize=cellSize;this.nearRadius=nearRadius;this.sleepDelaySec=sleepDelaySec;this.cells=new Map();this.bodies=new Map();}
  _cellsFor(aabb){const c=this.cellSize,keys=[];for(let x=Math.floor(aabb.min.x/c);x<=Math.floor(aabb.max.x/c);x++)for(let y=Math.floor(aabb.min.y/c);y<=Math.floor(aabb.max.y/c);y++)for(let z=Math.floor(aabb.min.z/c);z<=Math.floor(aabb.max.z/c);z++)keys.push(key(x,y,z));return keys;}
  upsert(id,aabb,meta={}){this.remove(id);const ks=this._cellsFor(aabb),body={id,aabb,meta,cells:ks,sleeping:false,idle:0};this.bodies.set(id,body);for(const k of ks){if(!this.cells.has(k))this.cells.set(k,new Set());this.cells.get(k).add(id);}return body;}
  remove(id){const b=this.bodies.get(id);if(!b)return;for(const k of b.cells){const s=this.cells.get(k);s?.delete(id);if(s?.size===0)this.cells.delete(k);}this.bodies.delete(id);}
  query(aabb){const out=new Set();for(const k of this._cellsFor(aabb))for(const id of this.cells.get(k)||[])out.add(id);return[...out].map(id=>this.bodies.get(id)).filter(Boolean);}
  updateSleeping(dt,playerPosition){for(const b of this.bodies.values()){const m=b.meta,center=m.getPosition?.()||m.position;const d=center?.distanceTo?.(playerPosition)??0;const contactCritical=m.playerContact===true||m.critical===true||d<=this.nearRadius;const speed=m.getSpeed?.()??Infinity;if(contactCritical||speed>0.02){b.idle=0;b.sleeping=false;}else{b.idle+=dt;if(b.idle>=this.sleepDelaySec)b.sleeping=true;}}}
  setSleepDelay(sec){if(Number.isFinite(sec)&&sec>=0)this.sleepDelaySec=sec;}
  report(){return{mode:'spatial-hash-broadphase-safe-sleep-v1',bodies:this.bodies.size,cells:this.cells.size,nearBodiesNeverSlept:true,playerContactBodiesNeverSlept:true,collisionGeometryReduced:false};}
}
