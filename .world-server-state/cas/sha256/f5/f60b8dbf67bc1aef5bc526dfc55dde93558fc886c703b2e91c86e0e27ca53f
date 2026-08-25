"use strict";
const {SpatialHashGrid}=require('../shared/pixel-animation-engine.js');
const n=Math.max(1000,Number(process.argv[2])||50000),queries=Math.max(50,Number(process.argv[3])||200);const grid=new SpatialHashGrid(128);for(let i=0;i<n;i++){const x=(i%1000)*16,y=Math.floor(i/1000)*16;grid.upsert(i,{x,y,w:16,h:16});}
const t0=performance.now();let found=0;for(let i=0;i<queries;i++){const x=(i*97)%12000,y=(i*53)%5000;found+=grid.query({x,y,w:1280,h:720}).size;}const ms=performance.now()-t0;console.log(JSON.stringify({objects:n,queries,totalMs:+ms.toFixed(3),avgQueryMs:+(ms/queries).toFixed(4),avgCandidates:Math.round(found/queries)}));if(ms/queries>4)process.exitCode=1;
