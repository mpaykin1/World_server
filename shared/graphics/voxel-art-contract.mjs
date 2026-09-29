// Shared deterministic contract for original Blender-generated semantic voxel art.
export const WORLD_VOXEL_TYPES=Object.freeze(["barren","city","forest","river","volcano","energy","idea","villager"]);
const ALIASES=Object.freeze({
  earth:"barren",land:"barren",desert:"barren",village:"city",nature:"forest",woods:"forest",
  electricity:"energy",power:"energy",concept:"idea",human:"villager",resident:"villager",person:"villager",
});
export const GAMEPLAY_BLOCKS=Object.freeze({
  barren:{footprint:[4,4],sockets:[],capabilities:["terrain"],events:[]},
  city:{footprint:[4,4],sockets:["road","energy"],capabilities:["settlement","repair"],events:["city.build","city.damage"]},
  forest:{footprint:[4,4],sockets:["terrain"],capabilities:["ecology","flammable","regrowth"],events:["forest.plant","forest.damage"]},
  river:{footprint:[4,4],sockets:["water"],capabilities:["water"],events:["river.place"]},
  volcano:{footprint:[4,4],sockets:["terrain"],capabilities:["hazard"],events:["volcano.activate"]},
  energy:{footprint:[4,4],sockets:["energy"],capabilities:["power_generation"],events:["energy.build"]},
  idea:{footprint:[2,2],sockets:[],capabilities:["idea"],events:["idea.discover"]},
  villager:{footprint:[1,1],sockets:["road"],capabilities:["resident","actor"],events:["resident.move"]},
});
export function voxelType(raw){
  const key=String(raw||"").trim().toLowerCase(),result=ALIASES[key]||key;
  return WORLD_VOXEL_TYPES.includes(result)?result:null;
}
export function gameplayBlock(raw){const type=voxelType(raw);return type?GAMEPLAY_BLOCKS[type]:null;}
const hash=v=>/^[a-f0-9]{64}$/.test(v||"");
const positiveInt=v=>Number.isSafeInteger(v)&&v>0;
function validLod(lod,index,type){
  if(!lod||lod.lod!==index||!positiveInt(lod.bytes)||!hash(lod.sha256))return false;
  const file=index===0?type+".glb":type+".lod"+index+".glb";
  if(lod.file!==file||!positiveInt(lod.triangles)||!positiveInt(lod.vertices)||!positiveInt(lod.visibleFaces))return false;
  if(!positiveInt(lod.voxelCount)||!positiveInt(lod.drawCalls)||!Number.isFinite(lod.generationMs))return false;
  return true;
}
export function validVoxelManifest(manifest){
  if(![1,2].includes(manifest?.schemaVersion)||!Array.isArray(manifest.entities))return false;
  const seen=new Set();
  return manifest.entities.length>0&&manifest.entities.every(item=>{
    if(!voxelType(item?.type)||seen.has(item.id)||item.id!==item.type||item.file!==item.type+".glb")return false;
    if(!hash(item.sha256)||!positiveInt(item.bytes)||!Array.isArray(item.clips)||!Array.isArray(item.vfx))return false;
    if(item.preview&&(
      item.preview.file!==item.id+".png"||!hash(item.preview.sha256)||!positiveInt(item.preview.bytes)))return false;
    if(manifest.schemaVersion===2){
      if(!Array.isArray(item.lods)||item.lods.length!==3||!item.lods.every((lod,i)=>validLod(lod,i,item.type)))return false;
      if(item.lods[0].sha256!==item.sha256||item.lods[0].bytes!==item.bytes)return false;
      const s=item.semantic;
      if(!s||s.file!=="semantics/"+item.id+".json"||!hash(s.sha256)||!positiveInt(s.bytes)||!positiveInt(s.featureCount))return false;
    }
    seen.add(item.id);return true;
  });
}
export function assetLod(meta,lod=0){
  const index=Math.max(0,Math.min(2,Math.floor(Number(lod)||0)));
  return meta?.lods?.[index]||{lod:0,file:meta?.file,url:meta?.url,bytes:meta?.bytes,triangles:meta?.triangles};
}
export function lodForDistance(distance,{mobile=false,current=null}={}){
  const d=Math.max(0,Number(distance)||0);
  const near=mobile?24:38,mid=mobile?58:86;
  if(current===0&&d<near*1.12)return 0;
  if(current===1&&d>near*.88&&d<mid*1.12)return 1;
  if(current===2&&d>mid*.88)return 2;
  return d<near?0:d<mid?1:2;
}
export function planVoxelPlacements(world,max=8){
  if(!world||!Array.isArray(world.entities))return[];
  const limit=Math.max(0,Math.min(24,Math.floor(Number(max)||0)));if(limit===0)return[];
  const seen=new Set(),result=[];
  for(const e of world.entities){
    const type=voxelType(e?.type||e?.kind),x=Number(e?.x??e?.position?.x),z=Number(e?.z??e?.position?.z);
    const radius=Number(e?.radius??30),id=String(e?.id||"");
    if(!type||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>10000||Math.abs(z)>10000||!id||seen.has(id))continue;
    seen.add(id);result.push({id,type,x,z,radius:Math.max(8,Math.min(160,Number.isFinite(radius)?radius:30))});
    if(result.length===limit)break;
  }
  return result;
}
