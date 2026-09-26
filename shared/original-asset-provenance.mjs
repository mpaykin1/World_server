/** Original metadata-only asset catalog, no third-party files included. */
const FORMATS=new Set(['glb','gltf','png','webp','ktx2','json']);
const RIGHTS=new Set(['original','cc0','cc-by-4.0','mit','licensed']);
const PATH=/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9_./-]+$/;
export function createOriginalAssetManifest(entries,{version=1}={}){
 if(version!==1||!Array.isArray(entries))throw new TypeError('manifest');
 const ids=new Set();
 const assets=entries.map(asset=>{
  if(!asset||typeof asset.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(asset.id)||ids.has(asset.id))throw new Error('invalid or duplicate id');
  ids.add(asset.id);
  if(typeof asset.path!=='string'||!PATH.test(asset.path)||!FORMATS.has(asset.path.split('.').pop()?.toLowerCase()))throw new Error('invalid path');
  if(!RIGHTS.has(asset.rights))throw new Error('missing or unsupported rights');
  if(typeof asset.author!=='string'||!asset.author.trim())throw new Error('author required');
  if(asset.rights==='licensed'&&(!asset.permissionUrl||!/^https:\/\//.test(asset.permissionUrl)))throw new Error('permission evidence required');
  if(asset.rights==='cc-by-4.0'&&(!asset.attribution||!asset.sourceUrl))throw new Error('attribution required');
  return {id:asset.id,path:asset.path,rights:asset.rights,author:asset.author,
   ...(asset.sourceUrl?{sourceUrl:asset.sourceUrl}:{}),
   ...(asset.permissionUrl?{permissionUrl:asset.permissionUrl}:{}),
   ...(asset.attribution?{attribution:asset.attribution}:{}),
   ...(asset.kind?{kind:asset.kind}:{})};
 });
 return {schema:'world-server-original-assets',version,assets};
}
export function selectOriginalAssets(manifest,{engine,formats}={}){
 if(manifest?.schema!=='world-server-original-assets'||manifest.version!==1||!Array.isArray(manifest.assets))throw new TypeError('manifest');
 const allowed=formats?new Set(formats):engine==='godot'?new Set(['glb','gltf','png','webp','json']):new Set(['glb','gltf','png','webp','ktx2','json']);
 return manifest.assets.filter(asset=>allowed.has(asset.path.split('.').pop().toLowerCase()));
}
