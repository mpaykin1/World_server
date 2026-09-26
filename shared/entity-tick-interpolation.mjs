/**
 * Independent 20 Hz entity interpolation for Three.js / Godot adapters.
 * Simulation authority remains server-side. Render positions never feed physics.
 */
const finite3 = p => p && ['x','y','z'].every(k => Number.isFinite(p[k]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angleDelta = (a,b) => Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function createEntityInterpolator({tickMs=50, maxEntities=2048}={}) {
  if (!(tickMs>0) || !Number.isFinite(tickMs)) throw new RangeError('tickMs');
  if (!Number.isSafeInteger(maxEntities) || maxEntities<1) throw new RangeError('maxEntities');
  const entities=new Map();
  return Object.freeze({
    ingest({id,position,heading=0,timestamp,teleport=false}) {
      if (typeof id!=='string'||!id||!finite3(position)||!Number.isFinite(heading)||!Number.isFinite(timestamp))
        throw new TypeError('invalid entity tick');
      const old=entities.get(id);
      if (old && timestamp<=old.current.timestamp) return false;
      if (!old && entities.size>=maxEntities) return false;
      const current={position:{...position},heading,timestamp};
      const previous=!old||teleport?current:old.current;
      entities.set(id,{previous,current});
      return true;
    },
    sample(id,renderTimestamp) {
      if (!Number.isFinite(renderTimestamp)) throw new TypeError('renderTimestamp');
      const entry=entities.get(id);
      if (!entry) return null;
      const {previous:a,current:b}=entry;
      // Deliberately render one tick behind: avoids extrapolation and jitter.
      const t=a===b?1:clamp((renderTimestamp-tickMs-a.timestamp)/(b.timestamp-a.timestamp),0,1);
      return {position:{
        x:a.position.x+(b.position.x-a.position.x)*t,
        y:a.position.y+(b.position.y-a.position.y)*t,
        z:a.position.z+(b.position.z-a.position.z)*t
      },heading:a.heading+angleDelta(a.heading,b.heading)*t};
    },
    remove(id){return entities.delete(id);},
    clear(){entities.clear();},
    get size(){return entities.size;}
  });
}
