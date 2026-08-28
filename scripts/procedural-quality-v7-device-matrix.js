#!/usr/bin/env node
'use strict';const {buildProfile}=require('../lib/api-handlers/procedural-quality-profile.js');
const cases=[
{name:'iphone-fallback',q:{webgpu:'0',webgl2:'1',memory:4,cores:6,dpr:3},expected:['balanced']},
{name:'mobile-webgpu',q:{webgpu:'1',webgl2:'1',memory:6,cores:8,dpr:3},expected:['high','cinematic']},
{name:'desktop-igpu',q:{webgpu:'1',webgl2:'1',memory:8,cores:8,dpr:1.5},expected:['cinematic']},
{name:'desktop-dgpu',q:{webgpu:'1',webgl2:'1',memory:16,cores:16,dpr:1},expected:['cinematic']},
{name:'reduced-motion',q:{webgpu:'1',webgl2:'1',memory:16,cores:16,dpr:2,reducedMotion:'1'},expected:['safe']}];
const results=cases.map(c=>{const p=buildProfile(c.q);return{...c,actual:p.tier,pass:c.expected.includes(p.tier)}}),pass=results.every(x=>x.pass);
const out={version:10,pass,physical:false,note:'synthetic policy matrix; V10 still requires physical-device verification before 100%',results};require('fs').writeFileSync(require('path').resolve(__dirname,'..','PROCEDURAL_QUALITY_DEVICE_MATRIX.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));if(!pass)process.exit(1);

