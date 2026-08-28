#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd(),has=(p,s)=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8').includes(s)}catch{return false}},read=(p,f={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}},d=read('data/real-device-provider.json',{}),r='shared/world-quality-autopilot.js';
const capabilities={
  gpuTimerQuery:has(r,'EXT_disjoint_timer_query_webgl2'),frameP95:has(r,'frameP95'),memoryPressure:has(r,'usedJSHeapSize'),
  longTaskObserver:has(r,'PerformanceObserver')&&has(r,"entryTypes:['longtask']"),deviceMemoryAware:has(r,'deviceMemory'),hardwareConcurrencyAware:has(r,'hardwareConcurrency'),
  adaptiveDpr:has(r,'setPixelRatio'),visibilityBudget:has(r,'registerVisibilityAdapter'),sceneBudget:has(r,'registerSceneBudgetAdapter'),materialBudget:has(r,'registerMaterialAdapter'),
  semanticCharacterRepair:has(r,'registerCharacterSemanticAdapter'),hlod:has('api/ai3d-voxel-generate.js','chunk_aabb_hlod')||has('apps/ai3d-voxel-city/client.js','far.visible')
};
const physical=String(d.status||'').toUpperCase()==='CONFIGURED',report={schemaVersion:'4.0.0',system:'WORLD_RUNTIME_QUALITY_PROFILER',generatedAt:new Date().toISOString(),capabilities,physicalDeviceProviderConfigured:physical,physicalDeviceProviderStatus:d.status||'UNKNOWN'};
report.percent=Math.round(Object.values(capabilities).filter(Boolean).length/Object.keys(capabilities).length*97)+(physical?3:0);fs.writeFileSync(path.join(ROOT,'WORLD_RUNTIME_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[WORLD_RUNTIME_QUALITY_PROFILER_V4] ${report.percent}%`);
