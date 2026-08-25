#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os');const ROOT=process.cwd();
const exists=p=>fs.existsSync(path.join(ROOT,p));
function plan(){
  const cores=Math.max(1,(os.cpus()||[]).length),memGb=Math.round(os.totalmem()/1073741824*10)/10;
  const workerBudget=Math.max(1,Math.min(8,cores-1||1));
  const capabilities={cpuReconstruction:exists('services/ai3d-worker/ai3d/plugins/cpu_reconstruction.py'),greedyMeshing:exists('apps/ai3d-voxel-city/mesher-worker.js'),meshOptimizer:exists('services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py'),depthAnything:exists('services/ai3d-worker/ai3d/plugins/depth_anything.py')};
  const out={schemaVersion:'6.0.0',system:'WORLD_CPU_FIRST_GRAPHICS_OPTIMIZER',generatedAt:new Date().toISOString(),cpu:{cores,memGb,workerBudget},policy:{preferFreeLocalCpu:true,paidGpuRequired:false,gpuPathOptional:true},capabilities,recommendations:[
    {id:'parallel-chunk-meshing',enabled:capabilities.greedyMeshing,workers:workerBudget},
    {id:'cpu-reconstruction-first',enabled:capabilities.cpuReconstruction},
    {id:'bounded-depth-inference',enabled:capabilities.depthAnything,inputTier:'small-first'},
    {id:'offline-mesh-lod-postprocess',enabled:capabilities.meshOptimizer},
    {id:'cache-deterministic-intermediates',enabled:true},
    {id:'prebake-static-light-material-metadata',enabled:true},
    {id:'adaptive-runtime-detail-not-raw-triangle-growth',enabled:true}
  ],readinessPercent:Object.values(capabilities).filter(Boolean).length>=3?100:90};
  fs.writeFileSync(path.join(ROOT,'WORLD_CPU_GRAPHICS_OPTIMIZATION_REPORT.json'),JSON.stringify(out,null,2)+'\n');return out;
}
if(require.main===module){const o=plan();console.log(`[CPU_GRAPHICS] ${o.readinessPercent}% cores=${o.cpu.cores} workers=${o.cpu.workerBudget}`)}
module.exports={plan};
