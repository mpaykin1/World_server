#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const MAGIC=0x46546c67,JSON_CHUNK=0x4e4f534a,BIN_CHUNK=0x004e4942;
function validateBuffer(buf,options={}){
 if(!Buffer.isBuffer(buf))buf=Buffer.from(buf);
 const errors=[];if(buf.length<20)return{ok:false,errors:['GLB too small'],bytes:buf.length};
 const magic=buf.readUInt32LE(0),version=buf.readUInt32LE(4),declared=buf.readUInt32LE(8);
 if(magic!==MAGIC)errors.push('bad GLB magic');if(version!==2)errors.push(`unsupported GLB version ${version}`);if(declared!==buf.length)errors.push(`declared length ${declared} != actual ${buf.length}`);
 let off=12,json=null,binBytes=0,chunks=0;
 while(off+8<=buf.length){const len=buf.readUInt32LE(off),type=buf.readUInt32LE(off+4);off+=8;if(len<0||off+len>buf.length){errors.push('chunk exceeds GLB length');break}const chunk=buf.subarray(off,off+len);off+=len;chunks++;if(type===JSON_CHUNK&&!json){try{json=JSON.parse(chunk.toString('utf8').replace(/[\u0000\u0020]+$/g,''))}catch(e){errors.push(`invalid JSON chunk: ${e.message}`)}}else if(type===BIN_CHUNK)binBytes+=len;}
 if(off!==buf.length)errors.push(`trailing or truncated bytes at ${off}/${buf.length}`);if(!json)errors.push('missing JSON chunk');
 if(json){if(String(json.asset?.version||'')!=='2.0')errors.push(`asset.version must be 2.0, got ${json.asset?.version??'missing'}`);if(!Array.isArray(json.scenes)||!json.scenes.length)errors.push('missing scenes');if(!Array.isArray(json.nodes)||!json.nodes.length)errors.push('missing nodes');const minNodes=Math.max(0,Number(options.minNodes||0)|0);if(minNodes&&Array.isArray(json.nodes)&&json.nodes.length<minNodes)errors.push(`nodes ${json.nodes.length} < required ${minNodes}`)}
 return{ok:errors.length===0,errors,bytes:buf.length,version,chunks,binBytes,nodes:Array.isArray(json?.nodes)?json.nodes.length:0,scenes:Array.isArray(json?.scenes)?json.scenes.length:0,assetVersion:json?.asset?.version||null};
}
function validateFile(file,options={}){const abs=path.resolve(file),result=validateBuffer(fs.readFileSync(abs),options);return{...result,file:abs}}
function main(){const file=process.argv[2];if(!file){console.error('Usage: node scripts/validate-ink-glyph-glb.cjs <file.glb> [--min-nodes N]');process.exit(2)}const i=process.argv.indexOf('--min-nodes'),minNodes=i>=0?Number(process.argv[i+1]||0):0,r=validateFile(file,{minNodes});if(!r.ok){console.error('INK_GLYPH_GLB_VALIDATE FAIL',r.errors.join('; '));process.exit(1)}console.log(`INK_GLYPH_GLB_VALIDATE PASS bytes=${r.bytes} nodes=${r.nodes} scenes=${r.scenes} chunks=${r.chunks} file=${r.file}`)}
if(require.main===module)main();
module.exports={validateBuffer,validateFile};
