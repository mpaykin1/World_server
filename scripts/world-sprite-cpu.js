#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {planWorldSprites}=require('../lib/world-sprite-needs');
const palettes={
  'frontier-smoke':[153,159,162],
  'river-ripple':[66,171,217],
  'volcanic-ash':[109,102,97]
};
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);
  length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,checksum]);
}
function png(width,height,pixels) {
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);
  header[8]=8;header[9]=6;
  const rows=[];
  for(let y=0;y<height;y++)rows.push(Buffer.from([0]),pixels.subarray(y*width*4,(y+1)*width*4));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),
    chunk('IDAT',zlib.deflateSync(Buffer.concat(rows),{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function atlas(asset) {
  const size=16,frames=4,pixels=Buffer.alloc(size*frames*size*4);
  const color=palettes[asset.id];if(!color)throw Error('Unknown procedural sprite '+asset.id);
  for(let frame=0;frame<frames;frame++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=x-7.5,dy=y-7.5;
    let visible=false;
    if(asset.id==='river-ripple')visible=Math.abs(Math.hypot(dx,dy)-(3+frame))<1.1 && Math.abs(dy)<4;
    if(asset.id==='volcanic-ash')visible=((x*13+y*7+frame*11)%23)<3 && y<12;
    if(asset.id==='frontier-smoke')visible=Math.hypot(dx+Math.sin((y+frame)*.8)*2,dy+frame-2)<3.5 && y<13;
    if(!visible)continue;
    const i=(y*size*frames+frame*size+x)*4;
    pixels[i]=color[0];pixels[i+1]=color[1];pixels[i+2]=color[2];pixels[i+3]=190;
  }
  return png(size*frames,size,pixels);
}
function generate(world,root) {
  const plan=planWorldSprites(world,[],{maxSprites:3}),created=[];
  for(const asset of plan.candidates){
    const bytes=atlas(asset),name=asset.id+'.png';
    fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,name),bytes);
    created.push({...asset,file:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      frameWidth:16,frameHeight:16,frames:4,atlasWidth:64,atlasHeight:16,
      states:['ambient'],fps:4,license:'CC0-1.0 original procedural CPU',alpha:true});
  }
  const manifest={schemaVersion:1,generator:'sprite-intelligence-cpu-v1',assets:created};
  fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}
if(require.main===module){
  const kind=process.argv[2],root=process.argv[3];
  if(!palettes[kind]||!root){console.error('Usage: node scripts/world-sprite-cpu.js <frontier-smoke|river-ripple|volcanic-ash> <output-dir>');process.exit(2);}
  const pairs={'frontier-smoke':['city','forest'],'river-ripple':['forest','river'],'volcanic-ash':['forest','volcano']};
  console.log(JSON.stringify(generate({entities:pairs[kind]},root)));
}
module.exports={generate,png,atlas};
