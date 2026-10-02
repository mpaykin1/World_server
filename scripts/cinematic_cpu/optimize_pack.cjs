#!/usr/bin/env node
'use strict';
/** Optional OFFLINE CPU optimization of ALL deterministic Blender GLBs.
 * Requires glTF Transform CLI 4.4.0 (npm i -g @gltf-transform/cli@4.4.0).
 * Original GLBs remain authoritative fallback. Meshopt + WebP give smaller
 * network payload without a server GPU; do not claim KTX2 VRAM compression.
 */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const DIR=path.join(ROOT,'apps/ai3d-voxel-city/cinematic-assets');
const MANIFEST=path.join(DIR,'cinematic-pack.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const npmGlobal=()=>{
  const p=cp.spawnSync('npm',['root','-g'],{encoding:'utf8',timeout:10000});
  if(p.status!==0)throw Error('Cannot find global npm root; install glTF Transform CLI 4.4.0');
  return p.stdout.trim();
};
const cli=process.env.GLTF_TRANSFORM_CLI_JS||path.join(
  process.platform==='win32'?path.join(process.env.APPDATA||'', 'npm/node_modules'):
    npmGlobal(), '@gltf-transform/cli/bin/cli.js');
function run(command,args){
  const result=cp.spawnSync(process.execPath,[command,...args],{encoding:'utf8',windowsHide:true,
    timeout:180000,maxBuffer:8*1024*1024,shell:false});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(command+' '+args[0]+' exit '+result.status+': '+
    (result.stderr||result.stdout||'').slice(-900));
  return(result.stdout||'').trim();
}
function ensureRequirements(){
  const version=run(cli,['--version']).trim();
  if(!version.startsWith('4.4.0'))throw Error('Pinned glTF Transform 4.4.0 expected; got '+version);
}
function inspectGlb(bytes){
  if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||
    bytes.readUInt32LE(8)!==bytes.length)throw Error('not glTF 2 GLB');
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const used=json.extensionsUsed||[];
  if(!used.includes('EXT_meshopt_compression'))throw Error('meshopt extension missing');
  if(!used.includes('EXT_texture_webp'))throw Error('WebP extension missing');
  return{extensionsUsed:used.filter(x=>x==='EXT_meshopt_compression'||x==='EXT_texture_webp'),
         meshCount:json.meshes?.length||0};
}
function optimize(){
  ensureRequirements();
  const m=JSON.parse(fs.readFileSync(MANIFEST,'utf8'));
  if(m.generator!=='cinematic-cpu-v1'||m.assets?.length!==6)throw Error('unexpected source manifest');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ws-cinematic-meshopt-'));
  const output=[];
  try{
    for(const asset of m.assets){
      const source=path.join(DIR,asset.file);
      const original=fs.readFileSync(source);
      if(sha(original)!==asset.sha256)throw Error('source checksum mismatch '+asset.file);
      const optimizedName=asset.file.replace(/\.glb$/,'.meshopt.glb');
      const candidate=path.join(tmp,optimizedName);
      run(cli,['optimize',source,candidate,
        '--compress','meshopt','--texture-compress','webp',
        '--flatten','false','--join','false','--instance','false','--simplify','false']);
      const result=fs.readFileSync(candidate);
      const info=inspectGlb(result);
      if(result.length>=original.length)throw Error('optimization did not shrink '+asset.file);
      const optimized={
        kind:asset.kind,lod:asset.lod,file:optimizedName,sourceSha256:asset.sha256,
        sha256:sha(result),bytes:result.length,...info
      };
      output.push({record:optimized,bytes:result});
      process.stdout.write(JSON.stringify({asset:optimizedName,from:original.length,to:result.length,
        reductionPct:+((1-result.length/original.length)*100).toFixed(1)})+'\n');
    }
    for(const {record,bytes} of output){
      const target=path.join(DIR,record.file);
      fs.writeFileSync(target,bytes);
    }
    m.optimized=output.map(x=>x.record);
    m.optimization={
      tool:'@gltf-transform/cli',version:'4.4.0',
      format:'EXT_meshopt_compression+EXT_texture_webp',
      sourceType:'embedded-PNG-fallback',
      sourceAssetsRemainUnchanged:true,
      gpuServerRequired:false
    };
    fs.writeFileSync(MANIFEST,JSON.stringify(m,null,2)+'\n');
    process.stdout.write('MESHOPT_PACK_READY '+output.length+'\n');
    return m;
  }finally{
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}
if(require.main===module){
  try{optimize();}catch(e){console.error('MESHOPT_PACK_FAILED',e.message);process.exitCode=1;}
}
module.exports={inspectGlb,optimize};
