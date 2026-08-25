#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const REGISTRY=path.join(ROOT,'data/system-cohesion-registry.json');
const REPORT=path.join(ROOT,'SYSTEM_COHESION_REPORT.json');
const DISCOVERED=path.join(ROOT,'DISCOVERED_TECHNOLOGIES.json');

function read(p,fallback){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return fallback}}
function exists(p){return fs.existsSync(path.join(ROOT,p))}
function text(p){try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}}

function auditOverlaps(registry){
  const systems=registry.systems||[];
  const overlaps=[];
  for(let i=0;i<systems.length;i++){
    for(let j=i+1;j<systems.length;j++){
      const a=systems[i],b=systems[j];
      if(a.overlaps?.includes(b.id) || b.overlaps?.includes(a.id)){
        overlaps.push({a:a.id,b:b.id,type:'declared-overlap',severity:'medium'});
      }
      // Heuristic: if both handle same keyword, flag potential overlap
      const aKw=(a.responsibility||'').toLowerCase(),bKw=(b.responsibility||'').toLowerCase();
      const keywords=['visual','texture','collision','controls','quality','supabase','migration'];
      for(const kw of keywords){
        if(aKw.includes(kw)&&bKw.includes(kw)){
          // Check if they are supposed to enhance each other
          const enhances = registry.enhancementMatrix?.some(m=>
            (m.from===a.id&&m.to===b.id)||(m.from===b.id&&m.to===a.id)
          );
          if(!enhances){
            overlaps.push({a:a.id,b:b.id,keyword:kw,type:'potential-overlap',severity:'low',note:`both handle ${kw} but no enhancement matrix`});
          }
        }
      }
    }
  }
  return overlaps;
}

function discoverTechnologies(registry){
  const discovered=[];
  // Scan Web APIs in shared/
  const webAPIs=registry.discoveryPolicy?.scanWebAPIs||[];
  for(const api of webAPIs){
    const used = text('shared/world-quality-autopilot.js').includes(api) ||
                 text('shared/golden-device-profile.js').includes(api) ||
                 text('shared/golden-performance-autotuner.js').includes(api);
    if(!used){
      // Check if API is available in modern browsers (heuristic)
      const available = ['WebGPU','OffscreenCanvas','Web Workers'].includes(api);
      if(available){
        discovered.push({id:api.toLowerCase().replace(/\s/g,'-'),name:api,category:'web-api',status:'discovered',proposal:`Add ${api} as optional enhancement with WebGL fallback (V13 policy)`,enhances:['world-quality-autopilot','golden-standard']});
      } else {
        discovered.push({id:api.toLowerCase().replace(/\s/g,'-'),name:api,category:'web-api',status:'not-used',note:`Not yet used, but could enhance if ${api} becomes available`});
      }
    }
  }
  // Scan AI models in services/ai3d-worker
  const aiModels=registry.discoveryPolicy?.scanAIModels||[];
  for(const model of aiModels){
    const used = text('services/ai3d-worker/ai3d/runner.py').includes(model) ||
                 text('data/technology-registry.json').includes(model);
    if(!used){
      discovered.push({id:model.toLowerCase().replace(/\./g,'-'),name:model,category:'ai-model',status:'not-integrated',proposal:`Integrate ${model} via gpu_router if it improves quality without paid GPU (CPU fallback)`,enhances:['cpu-night-autopilot']});
    }
  }
  // Scan Supabase RPCs
  const rpcs=registry.discoveryPolicy?.scanSupabase||[];
  for(const rpc of rpcs){
    const used = text('scripts/sync-supabase-migrations.cjs').includes(rpc) ||
                 text('scripts/fetch-quality-work-packet.cjs').includes(rpc);
    if(!used){
      discovered.push({id:rpc,name:rpc,category:'supabase-rpc',status:'not-used',proposal:`Wire ${rpc} into quality loop for work packets`});
    }
  }
  // Check for unknown tech that user doesn't know: scan for new files in services/ai3d-worker that are not in registry
  try{
    const plugins=fs.readdirSync(path.join(ROOT,'services/ai3d-worker/ai3d/plugins')).filter(f=>f.endsWith('.py')).map(f=>f.replace('.py',''));
    for(const p of plugins){
      if(!aiModels.some(m=>m.toLowerCase().includes(p.toLowerCase())) && !['depth_anything','trellis2','instantmesh','cpu_reconstruction','building','procgen_maps','godot_voxel','voxel_city','gpu_router','mesh_quality_optimizer','world_quality'].includes(p)){
        discovered.push({id:p,name:p,category:'ai-plugin',status:'discovered',proposal:`New plugin ${p} discovered — evaluate if it enhances quality loop`,enhances:['world-quality-autopilot']});
      }
    }
  }catch{}
  return discovered;
}

function main(){
  const registry=read('data/system-cohesion-registry.json',null);
  if(!registry) throw new Error('Missing registry');
  const overlaps=auditOverlaps(registry);
  const discovered=discoverTechnologies(registry);
  const cohesionScore = (()=> {
    const total=registry.systems.length;
    const overlapPenalty=overlaps.filter(o=>o.severity==='medium').length*5 + overlaps.filter(o=>o.severity==='low').length*2;
    const base=100 - overlapPenalty;
    return Math.max(0, Math.min(100, base));
  })();
  const enhancementCoverage = (()=> {
    const matrix=registry.enhancementMatrix||[];
    const systems=registry.systems.length;
    const possible=systems*(systems-1);
    return possible? Math.round(matrix.length/possible*100):0;
  })();
  const report={
    generatedAt:new Date().toISOString(),
    schemaVersion:'1.0.0',
    system:'SYSTEM_COHESION_ENGINE',
    cohesionScore,
    enhancementCoverage,
    overlaps,
    discoveredCount:discovered.length,
    discovered:discovered.slice(0,10),
    recommendation: cohesionScore<90 ? 'Resolve overlaps via enhancement matrix' : 'Cohesion is strong, consider integrating top discovered tech',
    topProposal: discovered.find(d=>d.status==='discovered'&&d.category==='web-api')||discovered[0]||null
  };
  fs.writeFileSync(REPORT, JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(DISCOVERED, JSON.stringify({generatedAt:report.generatedAt, count:discovered.length, technologies:discovered},null,2)+'\n');
  console.log(`[SYSTEM_COHESION] cohesionScore ${cohesionScore}% enhancementCoverage ${enhancementCoverage}% overlaps ${overlaps.length} discovered ${discovered.length}`);
  if(report.topProposal) console.log(`[SYSTEM_COHESION] top proposal: ${report.topProposal.name} -> ${report.topProposal.proposal}`);
  // Auto-create a new technology stub if it would enhance and is not yet known
  // Example: if WebGPU is discovered and not used, create a stub file for future integration
  if(report.topProposal && report.topProposal.category==='web-api' && report.topProposal.name==='WebGPU'){
    const stubPath=path.join(ROOT,'shared/webgpu-enhancement-stub.js');
    if(!fs.existsSync(stubPath)){
      const stub=`// Auto-generated stub for ${report.topProposal.name} — enhances ${report.topProposal.enhances.join(', ')}\n// Policy: optional, with WebGL fallback (V13)\n'use strict';\nif(typeof navigator!=='undefined'&&navigator.gpu){\n  console.log('[WEBGPU] stub: WebGPU available, could enhance large worlds');\n}\n`;
      fs.writeFileSync(stubPath, stub);
      console.log(`[SYSTEM_COHESION] created stub ${path.relative(ROOT,stubPath)}`);
    }
  }
  if(overlaps.some(o=>o.severity==='medium')) process.exitCode=27;
}

if(require.main===module) main();
module.exports={auditOverlaps,discoverTechnologies};
