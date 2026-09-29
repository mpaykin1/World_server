'use strict';
// Trusted-base verifier: inspect PR blobs as inert bytes, never execute candidate code.
const cp=require('node:child_process');
const crypto=require('node:crypto');
const {readBlobs}=require('./git-blob-batch.cjs');
const TYPES=['barren','city','forest','volcano','energy','idea','river','villager'];
const ROOT='apps/voxel-world/voxel-art/';
const SHA=/^[a-f0-9]{40}$/i;
function git(args,{binary=false,input}={}){
  return cp.execFileSync('git',args,{encoding:binary?null:'utf8',input,
    maxBuffer:binary?8_000_000:500_000,timeout:90000,windowsHide:true});
}
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function parseChanges(raw){
  return raw.trim().split(/\r?\n/).filter(Boolean).map(row=>{
    const match=/^(-|\d+)\t(-|\d+)\t(.+)$/.exec(row);
    if(!match)throw Error('Unexpected git --numstat line');
    return {path:match[3],binary:match[1]==='-'&&match[2]==='-'};
  });
}
function parseGLB(bytes,meta){
  if(bytes.length!==meta.bytes||bytes.toString('ascii',0,4)!=='glTF'||
    bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||
    bytes.readUInt32LE(16)!==0x4e4f534a)throw Error(meta.id+' GLB structure/size');
  const size=bytes.readUInt32LE(12);
  if(size>bytes.length-20||size<20)throw Error(meta.id+' GLB JSON length');
  const json=JSON.parse(bytes.subarray(20,20+size).toString('utf8').trim());
  if(!json.meshes?.length||!json.accessors?.length||meta.triangles>5000)
    throw Error(meta.id+' meshes/accessors/poly budget');
  const clips=(json.animations||[]).map(x=>x.name).sort();
  if(JSON.stringify(clips)!==JSON.stringify(meta.clips.slice().sort()))
    throw Error(meta.id+' clip list mismatch');
}
function inspectPNG(bytes,meta){
  if(bytes.length!==meta.preview.bytes||
    bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||
    bytes.toString('ascii',12,16)!=='IHDR'||
    bytes.readUInt32BE(16)<128||bytes.readUInt32BE(20)<128||
    bytes.length>1_000_000)throw Error(meta.id+' PNG structure/size');
}
function auditBinaryAssets(base,head,{run=git}={}){
  const report={verdict:'INCONCLUSIVE',changed:0,glb:0,png:0,
    glbBytes:0,previewBytes:0,assets:[],blockers:[],
    licenseCheck:'CC0 provenance declared in manifest; maintainer must confirm authorship'};
  try{
    if(!SHA.test(base)||!SHA.test(head))throw Error('Exact SHAs required');
    const changes=parseChanges(run(['diff','--numstat','--no-renames',base+'...'+head,'--']));
    const binary=changes.filter(e=>e.binary);
    report.changed=binary.length;
    if(!binary.length){report.verdict='NOT_APPLICABLE';return report;}
    for(const item of changes){
      if(!/\.(png|glb)$/i.test(item.path)&&!item.binary)continue;
      if(!item.binary||!new RegExp('^'+ROOT.replaceAll('/','\\/')+
        '('+TYPES.join('|')+')\\.(glb|png)$').test(item.path)){
        throw Error('Unexpected or nonbinary asset requires manual review: '+item.path);
      }
    }
    const paths=[ROOT+'manifest.json',...TYPES.flatMap(id=>[ROOT+id+'.glb',ROOT+id+'.png'])];
    const blobs=readBlobs(head,paths,run);
    const manifest=JSON.parse(blobs.get(ROOT+'manifest.json').toString('utf8'));
    if(manifest.schemaVersion!==1||manifest.entities?.length!==TYPES.length)
      throw Error('Manifest missing or incomplete');
    const all=new Set();
    for(const meta of manifest.entities){
      if(!TYPES.includes(meta.id)||all.has(meta.id)||meta.type!==meta.id||
        meta.file!==meta.id+'.glb'||!(/^[a-f0-9]{64}$/).test(meta.sha256||'')||
        meta.license!=='CC0-1.0'||meta.origin!=='World Server original procedural voxel art'||
        !Array.isArray(meta.clips)||!Number.isInteger(meta.triangles)||
        !meta.preview||meta.preview.file!==meta.id+'.png'||
        !(/^[a-f0-9]{64}$/).test(meta.preview.sha256||'')||
        !Number.isInteger(meta.preview.bytes))throw Error('Manifest metadata invalid: '+meta.id);
      all.add(meta.id);
      const glb=blobs.get(ROOT+meta.file);
      if(sha256(glb)!==meta.sha256)throw Error(meta.id+' GLB hash mismatch');
      parseGLB(glb,meta);
      const png=blobs.get(ROOT+meta.preview.file);
      if(sha256(png)!==meta.preview.sha256)throw Error(meta.id+' PNG hash mismatch');
      inspectPNG(png,meta);
      report.glb++;report.png++;report.glbBytes+=glb.length;
      report.previewBytes+=png.length;
      report.assets.push({id:meta.id,glbSha256:meta.sha256,
        pngSha256:meta.preview.sha256,clips:meta.clips});
    }
    const allowed=new Set(TYPES.flatMap(id=>[ROOT+id+'.glb',ROOT+id+'.png']));
    if(binary.some(item=>!allowed.has(item.path)))throw Error('Unlisted binary asset');
    report.verdict='PASS';
  }catch(error){report.blockers.push(String(error.message||error).slice(0,280));}
  return report;
}
module.exports={auditBinaryAssets,parseChanges,parseGLB};
