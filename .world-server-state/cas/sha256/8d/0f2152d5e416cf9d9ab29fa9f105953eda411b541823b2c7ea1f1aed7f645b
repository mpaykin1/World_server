#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),apps=path.join(root,'apps');
let files=0,patched=0,found=0;
function walk(d){if(!fs.existsSync(d))return;for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory()){walk(p);continue}if(!e.isFile()||!/\.(m?js)$/i.test(e.name))continue;files++;let x=fs.readFileSync(p,'utf8');if(!x.includes('THREE.WebGLRenderer'))continue;found++;
 if(x.includes('WorldProceduralThreeNative'))continue;
 const rx=/((?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.WebGLRenderer\s*\([\s\S]*?\);)/m;
 const m=x.match(rx);if(!m)continue;
 const line=`${m[1]}\n  globalThis.WorldProceduralThreeNative?.attach?.(${m[2]}, THREE);\n  if(typeof world!=='undefined'&&typeof activeCamera!=='undefined')globalThis.WorldProceduralVoxelDDGI?.attach?.({renderer:${m[2]},worldGetter:()=>world,cameraGetter:()=>activeCamera});`;
 x=x.replace(rx,line);fs.writeFileSync(p,x,'utf8');patched++;console.log('THREE NATIVE PATCH',path.relative(root,p));
}}
walk(apps);
const report={version:10,filesScanned:files,threeRenderersFound:found,patched};
fs.writeFileSync(path.join(root,'PROCEDURAL_THREE_NATIVE_PATCH.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
