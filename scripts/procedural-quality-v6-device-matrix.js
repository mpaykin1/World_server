'use strict';const fs=require('fs'),path=require('path'),{buildProfile}=require('../lib/api-handlers/procedural-quality-profile.js');
const cases=[
{name:'mobile-fallback',q:{webgpu:'0',webgl2:'1',memory:4,cores:4,dpr:3},min:'balanced'},
{name:'mobile-webgpu',q:{webgpu:'1',webgl2:'1',memory:6,cores:6,dpr:3},min:'high'},
{name:'desktop-igpu',q:{webgpu:'1',webgl2:'1',memory:8,cores:8,dpr:1.5},min:'cinematic'},
{name:'desktop-fallback',q:{webgpu:'0',webgl2:'1',memory:8,cores:8,dpr:1},min:'balanced'},
{name:'reduced-motion',q:{webgpu:'1',webgl2:'1',memory:16,cores:16,dpr:2,reducedMotion:'1'},min:'safe'}];
const rank={safe:0,balanced:1,high:2,cinematic:3};const results=cases.map(c=>{const p=buildProfile(c.q);return{...c,actual:p.tier,pass:rank[p.tier]>=rank[c.min]&&p.version===6}});
const report={version:6,pass:results.every(x=>x.pass),note:'synthetic capability policy matrix; not a replacement for physical-device testing',results};fs.writeFileSync(path.join(__dirname,'..','PROCEDURAL_QUALITY_DEVICE_MATRIX.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.pass)process.exit(1);

