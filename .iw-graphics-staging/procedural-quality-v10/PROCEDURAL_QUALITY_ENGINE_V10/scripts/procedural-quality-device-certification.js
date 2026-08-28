#!/usr/bin/env node
'use strict';const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),url=process.argv[2]||process.env.PROCEDURAL_QUALITY_BASE_URL||'';
async function main(){if(!url){const o={version:8,certified:false,physical:false,reason:'no-preview-url'};fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_DEVICE_CERTIFICATION.json'),JSON.stringify(o,null,2)+'\n');console.log(JSON.stringify(o,null,2));return}
 const r=await fetch(url.replace(/\/$/,'')+'/api/procedural-quality-certification',{headers:{accept:'application/json'}});const j=await r.json();fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_DEVICE_CERTIFICATION.json'),JSON.stringify(j,null,2)+'\n');console.log(JSON.stringify(j,null,2));
 if(process.env.PROCEDURAL_PHYSICAL_DEVICE_REQUIRED==='1'&&!j.certified)process.exit(1)}
main().catch(e=>{console.error(e);process.exit(1)});
