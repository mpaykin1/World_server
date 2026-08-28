#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'assets','hanzi-strokes'),VERSION='2.0.1';
const args=process.argv.slice(2),force=args.includes('--force'),glyphIndex=args.indexOf('--glyphs');
const glyphText=glyphIndex>=0&&args[glyphIndex+1]?args[glyphIndex+1]:'龍山水火天地人風雨雷月日木金土空';
const glyphs=[...new Set([...glyphText].filter(ch=>ch.trim()))];
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex')}
function curl(url){for(const bin of process.platform==='win32'?['curl.exe','curl']:['curl']){const r=cp.spawnSync(bin,['-L','--fail','--silent','--show-error','--max-time','120',url],{encoding:null,maxBuffer:16*1024*1024,windowsHide:true});if(r.status===0&&r.stdout?.length)return Buffer.from(r.stdout)}return null}
async function get(url){let last;for(let i=0;i<3;i++){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),90000);try{const r=await fetch(url,{headers:{'user-agent':'WorldServer-InkGlyphWorld/3.0'},signal:ac.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer())}catch(e){last=e;await new Promise(r=>setTimeout(r,500*(i+1)))}finally{clearTimeout(t)}}const c=curl(url);if(c)return c;throw last||new Error('download failed')}
function fileFor(ch){return `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')}.json`}
function validate(data,ch){if(!data||!Array.isArray(data.strokes)||!Array.isArray(data.medians)||!data.strokes.length||data.strokes.length!==data.medians.length)throw new Error(`invalid stroke data for ${ch}`);if(data.medians.some(m=>!Array.isArray(m)||!m.length))throw new Error(`empty median for ${ch}`)}
(async()=>{fs.mkdirSync(OUT,{recursive:true});const manifest={schemaVersion:1,package:'hanzi-writer-data',version:VERSION,license:'Arphic Public License',source:'https://github.com/chanind/hanzi-writer-data',generatedAt:new Date().toISOString(),glyphs:[]};
  const licPath=path.join(OUT,'ARPHICPL.TXT');let lic=!force&&fs.existsSync(licPath)?fs.readFileSync(licPath):null;if(!lic){lic=await get(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@${VERSION}/ARPHICPL.TXT`);if(!lic.toString('utf8').includes('ARPHIC PUBLIC LICENSE'))throw new Error('stroke data license validation failed');fs.writeFileSync(licPath+'.tmp',lic);fs.renameSync(licPath+'.tmp',licPath)}
  for(const ch of glyphs){const name=fileFor(ch),target=path.join(OUT,name);let buf=!force&&fs.existsSync(target)?fs.readFileSync(target):null,data;try{if(buf){data=JSON.parse(buf.toString('utf8'));validate(data,ch)}}catch{buf=null}if(!buf){console.log(`DOWNLOAD stroke ${ch}`);buf=await get(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@${VERSION}/${encodeURIComponent(ch)}.json`);data=JSON.parse(buf.toString('utf8'));validate(data,ch);fs.writeFileSync(target+'.tmp',buf);fs.renameSync(target+'.tmp',target)}manifest.glyphs.push({glyph:ch,file:name,strokes:data.strokes.length,bytes:buf.length,sha256:sha256(buf)});console.log(`PASS ${ch} strokes=${data.strokes.length}`)}
  fs.writeFileSync(path.join(OUT,'MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`INK_GLYPH_STROKES PASS ${manifest.glyphs.length}/${glyphs.length}`)
})().catch(e=>{console.error(`INK_GLYPH_STROKES FAIL: ${e.stack||e}`);process.exit(1)});
