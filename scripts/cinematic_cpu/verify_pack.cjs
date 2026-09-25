#!/usr/bin/env node
'use strict';
/** Fail-closed integrity + geometry-budget check for the generated CPU cinematic pack. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..');
const DIR=path.join(ROOT,'apps/ai3d-voxel-city/cinematic-assets');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function checkGlb(bytes){
  if(bytes.length<32||bytes.toString('ascii',0,4)!=='glTF')throw Error('invalid GLB magic');
  if(bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('invalid GLB version/length');
  const jsonLen=bytes.readUInt32LE(12),tag=bytes.toString('ascii',16,20);
  if(tag!=='JSON'||jsonLen>bytes.length-20)throw Error('invalid GLB JSON chunk');
  let json;
  try{json=JSON.parse(bytes.toString('utf8',20,20+jsonLen));}catch{throw Error('bad glTF JSON')}
  if(!json.asset||json.asset.version!=='2.0'||!json.scenes?.length||!json.meshes?.length)throw Error('incomplete glTF');
  if(!json.buffers?.length||!json.materials?.length)throw Error('missing binary/materials');
  return {meshes:json.meshes.length,materials:json.materials.length,textures:json.textures?.length||0,
    extensionsUsed:json.extensionsUsed||[],extensionsRequired:json.extensionsRequired||[]};
}
function validate(dir=DIR,manifest=null){
  const m=manifest||JSON.parse(fs.readFileSync(path.join(dir,'cinematic-pack.json'),'utf8'));
  if(m.schema!==1||m.generator!=='cinematic-cpu-v1'||m.device!=='CPU_ONLY')throw Error('wrong pack provenance');
  if(m.status!=='CANDIDATE_NOT_VISUALLY_VERIFIED')throw Error('unverified assets cannot self-certify');
  if(!Array.isArray(m.assets)||m.assets.length!==6||!Array.isArray(m.textures)||m.textures.length!==6||
    !Array.isArray(m.optimized)||m.optimized.length!==6)throw Error('pack incomplete');
  let total=0,optimizedTotal=0,mobileOptimizedBytes=0;
  const unique=new Set();
  for(const t of m.textures){
    if(!/^[a-z-]+\.png$/.test(t.file)||unique.has(t.file))throw Error('invalid/duplicate texture');
    unique.add(t.file);
    const bytes=fs.readFileSync(path.join(dir,t.file));
    if(hash(bytes)!==t.sha256||bytes.length!==t.bytes||bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('texture mismatch: '+t.file);
    const resolution=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    const expected=t.file.endsWith('-normal.png')?256:(t.file.startsWith('steel')?384:512);
    if(resolution!==expected||height!==expected)throw Error('unexpected material resolution: '+t.file);
    total+=bytes.length;
  }
  const result={ok:true,shaByAsset:{},tiers:{},totalBytes:0};
  for(const kind of ['geothermal-plant','volcano']){
    const lods=[];
    for(let level=0;level<3;level++){
      const a=m.assets.find(x=>x.kind===kind&&x.lod===level);
      if(!a||a.file!==kind+'-lod'+level+'.glb'||unique.has(a.file))throw Error('missing/duplicate LOD');
      unique.add(a.file);
      const bytes=fs.readFileSync(path.join(dir,a.file));
      if(bytes.length!==a.bytes||hash(bytes)!==a.sha256)throw Error('checksum mismatch: '+a.file);
      const glb=checkGlb(bytes);
      if(a.triangles<=0||a.triangles>20000||a.objects<1||a.objects>6||glb.meshes>a.objects*3||glb.textures<2)throw Error('unbounded render complexity');
      if(bytes.length>2*1048576)throw Error('large GLB');
      lods.push(a);result.shaByAsset[a.file]=a.sha256.slice(0,12);
      total+=bytes.length;
      const opt=m.optimized.find(x=>x.kind===kind&&x.lod===level);
      if(!opt||opt.sourceSha256!==a.sha256||opt.file!==kind+'-lod'+level+'.meshopt.glb'||
          unique.has(opt.file))throw Error('missing/stale optimized asset');
      unique.add(opt.file);
      const compressed=fs.readFileSync(path.join(dir,opt.file));
      if(compressed.length!==opt.bytes||hash(compressed)!==opt.sha256)throw Error('optimized checksum mismatch');
      const packed=checkGlb(compressed);
      if(!packed.extensionsUsed.includes('EXT_meshopt_compression')||
         !packed.extensionsUsed.includes('EXT_texture_webp')||
         compressed.length>=bytes.length)throw Error('optimized format or reduction invalid');
      optimizedTotal+=compressed.length;
      if(level!==0)mobileOptimizedBytes+=compressed.length;
    }
    if(!(lods[0].triangles>lods[1].triangles&&lods[1].triangles>lods[2].triangles))throw Error('LOD triangle order');
    if(!(lods[0].bytes>lods[1].bytes&&lods[1].bytes>lods[2].bytes))throw Error('LOD size order');
    result.tiers[kind]=lods.map(a=>({lod:a.lod,triangles:a.triangles,drawCallUpperBound:a.objects,bytes:a.bytes}));
  }
  if(total>6*1048576)throw Error('total budget exceeded');
  if(optimizedTotal>1048576||mobileOptimizedBytes>240000)throw Error('optimized transfer budget exceeded');
  const mobileTotal=m.assets.filter(a=>a.lod!==0).reduce((s,a)=>s+a.bytes,0);
  if(mobileTotal>3*1048576)throw Error('mobile low-tier download budget exceeded');
  result.mobileAssetBytes=mobileTotal;
  result.totalOptimizedBytes=optimizedTotal;
  result.mobileOptimizedBytes=mobileOptimizedBytes;
  result.totalBytes=total;
  return result;
}
if(require.main===module){
  try{const d=validate();console.log(JSON.stringify(d,null,2));}catch(e){console.error('CINEMATIC_CPU_PACK_INVALID: '+e.message);process.exitCode=1}
}
module.exports={validate,checkGlb};
