const DB='WORLD_FACTORY_IMMUTABLE_ASSET_CACHE_V1', STORE='assets';
const mem=new Map();
function db(){return new Promise((resolve,reject)=>{if(!('indexedDB'in globalThis))return resolve(null);const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function digest(buffer){const h=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function get(key){if(mem.has(key))return mem.get(key);const d=await db();if(!d)return null;return new Promise(res=>{const tx=d.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);});}
async function put(key,value){mem.set(key,value);const d=await db();if(!d)return;await new Promise(res=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,key);tx.oncomplete=()=>res();tx.onerror=()=>res();});}
function mimeFor(url){const x=String(url).toLowerCase();if(x.endsWith('.glb'))return'model/gltf-binary';if(x.endsWith('.ply'))return'application/octet-stream';if(x.endsWith('.spz'))return'application/octet-stream';return'application/octet-stream';}
export async function getVerifiedAssetURL(url,expectedSha=null,{cache=true}={}){
  if(!cache||!expectedSha||!globalThis.crypto?.subtle)return url;
  const key=`sha256:${expectedSha}`;let entry=await get(key);
  if(entry?.buffer){const actual=await digest(entry.buffer);if(actual===expectedSha){return URL.createObjectURL(new Blob([entry.buffer],{type:entry.mime||mimeFor(url)}));}}
  const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`Asset cache HTTP ${r.status}: ${url}`);const buffer=await r.arrayBuffer();const actual=await digest(buffer);
  if(actual!==expectedSha)throw new Error(`Immutable asset SHA mismatch: expected ${expectedSha}, got ${actual}`);
  entry={buffer,mime:r.headers.get('content-type')||mimeFor(url),sourceUrl:url,sha256:actual,storedAt:Date.now()};await put(key,entry);
  return URL.createObjectURL(new Blob([buffer],{type:entry.mime}));
}
export async function prefetchImmutable(url,sha256){try{await getVerifiedAssetURL(url,sha256);return true;}catch(e){console.warn('immutable prefetch',e);return false;}}
export function cacheReport(){return{mode:'indexeddb-sha256-v1',memoryEntries:mem.size,sourceAssetsModified:false,qualityReduced:false};}
