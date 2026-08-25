import { MeshBVH } from 'three-mesh-bvh';
const DB='WORLD_FACTORY_BVH_CACHE_V1',STORE='bvh';
function openDb(){return new Promise((resolve,reject)=>{if(!('indexedDB'in globalThis))return resolve(null);const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function io(mode,key,value){const d=await openDb();if(!d)return null;return new Promise(res=>{const tx=d.transaction(STORE,mode),s=tx.objectStore(STORE),r=value===undefined?s.get(key):s.put(value,key);if(value===undefined){r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null)}else{tx.oncomplete=()=>res(true);tx.onerror=()=>res(false)}})}
export async function hydrateOrBuildBVH(geometry,key,options={maxLeafTris:12,indirect:true}){
  if(!key){geometry.boundsTree=new MeshBVH(geometry,options);return{cacheHit:false,key:null};}
  try{const packed=await io('readonly',key);if(packed?.serialized){geometry.boundsTree=MeshBVH.deserialize(packed.serialized,geometry,{setIndex:true});return{cacheHit:true,key};}}catch(e){console.warn('BVH cache read',e)}
  geometry.boundsTree=new MeshBVH(geometry,options);
  try{const serialized=MeshBVH.serialize(geometry.boundsTree,{cloneBuffers:true});await io('readwrite',key,{serialized,createdAt:Date.now()});}catch(e){console.warn('BVH cache write',e)}
  return{cacheHit:false,key};
}
