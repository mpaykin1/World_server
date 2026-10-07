// Versioned deterministic registry for voxel gameplay mods and blueprints.
// The registry contains metadata and generator contracts only; it does not own
// persistence, rendering, simulation arithmetic or network authority.

export const VOXEL_MOD_API_VERSION=1;

const ID_RE=/^[a-z][a-z0-9-]{1,39}:[a-z][a-z0-9-]{1,63}$/;
const MOD_RE=/^[a-z][a-z0-9-]{1,39}$/;
const deepFreeze=value=>{
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  Object.freeze(value);for(const v of Object.values(value))deepFreeze(v);return value;
};
const jsonClone=value=>JSON.parse(JSON.stringify(value));

function validateMod(mod){
  if(!mod||typeof mod!=='object')throw new TypeError('Voxel mod manifest required');
  if(!MOD_RE.test(String(mod.id||'')))throw new TypeError('Invalid voxel mod id');
  if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(String(mod.version||'')))throw new TypeError('Invalid voxel mod version');
  if(Number(mod.apiVersion)!==VOXEL_MOD_API_VERSION)throw new RangeError('Unsupported voxel mod API version');
  const structures=mod.structures||{};
  for(const [id,entry] of Object.entries(structures)){
    if(!ID_RE.test(id)||!id.startsWith(mod.id+':'))throw new TypeError('Invalid structure id');
    if(typeof entry?.generate!=='function')throw new TypeError('Structure generator required');
    if(!Number.isInteger(entry.blueprintVersion)||entry.blueprintVersion<1)throw new TypeError('Blueprint version required');
  }
  return mod;
}

function publicManifest(mod){
  return deepFreeze({
    id:mod.id,
    version:mod.version,
    apiVersion:mod.apiVersion,
    license:String(mod.license||'project-original'),
    provenance:String(mod.provenance||'project-original'),
    structures:Object.fromEntries(Object.entries(mod.structures||{}).map(([id,s])=>[id,{
      blueprintVersion:s.blueprintVersion,
      title:String(s.title||id),
      category:String(s.category||'structure'),
    }])),
  });
}

export function createVoxelModRegistry(){
  const mods=new Map(),structures=new Map();

  function register(modInput){
    const mod=validateMod(modInput);
    if(mods.has(mod.id))throw new Error(`Voxel mod already registered: ${mod.id}`);
    for(const id of Object.keys(mod.structures||{}))if(structures.has(id))throw new Error(`Voxel structure already registered: ${id}`);
    mods.set(mod.id,mod);
    for(const [id,s] of Object.entries(mod.structures||{}))structures.set(id,{modId:mod.id,...s});
    return publicManifest(mod);
  }

  function unregister(modId){
    const mod=mods.get(modId);if(!mod)return false;
    for(const id of Object.keys(mod.structures||{}))structures.delete(id);
    mods.delete(modId);return true;
  }

  function compileBlueprint(input={},options={}){
    const structureId=String(input.structureId||'');
    const entry=structures.get(structureId);
    if(!entry)throw new RangeError(`Unknown voxel structure: ${structureId}`);
    const version=Number(input.blueprintVersion??entry.blueprintVersion);
    if(!Number.isInteger(version)||version!==entry.blueprintVersion)throw new RangeError('Unsupported blueprint version');
    const seed=Math.trunc(Number(input.seed)||1);
    const params=input.params&&typeof input.params==='object'&&!Array.isArray(input.params)?jsonClone(input.params):{};
    const result=entry.generate({...params,seed},options);
    if(!result||!Array.isArray(result.voxels))throw new TypeError('Structure generator returned invalid result');
    return {
      schemaVersion:VOXEL_MOD_API_VERSION,
      modId:entry.modId,
      structureId,
      blueprintVersion:version,
      seed,
      params,
      structure:result,
    };
  }

  function snapshot(){
    return deepFreeze({
      apiVersion:VOXEL_MOD_API_VERSION,
      mods:[...mods.values()].map(publicManifest).sort((a,b)=>a.id.localeCompare(b.id)),
      structures:[...structures.entries()].map(([id,s])=>({
        id,modId:s.modId,blueprintVersion:s.blueprintVersion,title:String(s.title||id),category:String(s.category||'structure'),
      })).sort((a,b)=>a.id.localeCompare(b.id)),
    });
  }

  function hasStructure(id){return structures.has(String(id));}
  return{register,unregister,compileBlueprint,snapshot,hasStructure};
}
