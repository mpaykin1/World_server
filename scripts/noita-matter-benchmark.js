'use strict';

const { DenseMatterGrid } = require('../lib/world-matter-dense-grid');

function percentile(values,p){
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0;
}

const grid=new DenseMatterGrid(256,144,{seed:20261002});
for(let x=0;x<256;x++)grid.set(x,0,'stone');
let placed=0;
for(let y=72;y<138;y++)for(let x=36;x<220&&placed<12000;x++){
  grid.set(x,y,'sand');placed++;
}

const samples=[];
let processed=0;
for(let i=0;i<120;i++){
  const start=process.hrtime.bigint();
  const stats=grid.step({maxCells:80000});
  const end=process.hrtime.bigint();
  samples.push(Number(end-start)/1e6);
  processed+=stats.processed;
}

const report={
  grid:[grid.width,grid.height],
  seededCells:placed,
  ticks:samples.length,
  meanMs:Number((samples.reduce((a,b)=>a+b,0)/samples.length).toFixed(3)),
  p50Ms:Number(percentile(samples,.50).toFixed(3)),
  p95Ms:Number(percentile(samples,.95).toFixed(3)),
  maxMs:Number(Math.max(...samples).toFixed(3)),
  processed,
  final:grid.stats()
};
console.log(JSON.stringify(report,null,2));
