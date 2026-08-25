#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const {chromium}=require('@playwright/test'),{PNG}=require('pngjs');
const root=path.resolve(__dirname,'..'),base=(process.argv[2]||'http://127.0.0.1:3000').replace(/\/$/,'');
const list=(process.argv[3]||'apps/procedural-quality-lab,apps/ai3d-voxel-city').split(',').map(s=>s.trim()).filter(Boolean);
const outDir=path.join(root,'artifacts','procedural-golden');fs.mkdirSync(outDir,{recursive:true});
function metrics(buf){const p=PNG.sync.read(buf),d=p.data,w=p.width,h=p.height,hist=Array(16).fill(0);let l=0,l2=0,sat=0,edge=0,n=0;
 for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),Y=.2126*r+.7152*g+.0722*b;l+=Y;l2+=Y*Y;sat+=(mx-mn)/255;hist[Math.min(15,Math.floor(Y/16))]++;n++;
  if(x+2<w){const j=(y*w+x+2)*4;edge+=Math.abs(Y-(.2126*d[j]+.7152*d[j+1]+.0722*d[j+2]))/255}
 }
 const mean=l/n,contrast=Math.sqrt(Math.max(0,l2/n-mean*mean));const hs=hist.reduce((a,b)=>a+b,0)||1;
 return{width:w,height:h,meanLuma:+mean.toFixed(3),contrast:+contrast.toFixed(3),saturation:+(sat/n).toFixed(5),edgeEnergy:+(edge/n).toFixed(5),histogram:hist.map(v=>+(v/hs).toFixed(6))}}
(async()=>{const browser=await chromium.launch({headless:true}),rows=[];
 try{for(const rel of list){const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});const url=`${base}/${rel.replace(/^\/|\/$/g,'')}/`;await page.goto(url,{waitUntil:'networkidle',timeout:45000});await page.waitForTimeout(1800);const buf=await page.screenshot({fullPage:false});const name=rel.replace(/[^\w-]+/g,'_'),file=path.join(outDir,name+'.png');fs.writeFileSync(file,buf);rows.push({scene:rel,url,sha256:crypto.createHash('sha256').update(buf).digest('hex'),file:path.relative(root,file).replace(/\\/g,'/'),metrics:metrics(buf),recordedAt:new Date().toISOString()});await page.close()}
 }finally{await browser.close()}
 const report={version:10,base,rows};fs.writeFileSync(path.join(root,'PROCEDURAL_GOLDEN_BASELINES.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exit(1)});
