#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const readText=p=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}};
const exists=p=>fs.existsSync(path.join(ROOT,p));
const readJson=(p,f={})=>{try{return JSON.parse(readText(p))}catch{return f}};
const lower=s=>String(s||'').toLowerCase();
function declaredTechnologyNames(){
  const score=readJson('data/quality-scorecard.json',{}),audit=readJson('TECHNOLOGY_AUDIT.json',{}),out=new Set();
  for(const k of Object.keys(score.technologyUsage||{}))out.add(k);
  for(const k of Object.keys(audit.technologies||{}))out.add(k);
  const inv=readJson('services/ai3d-worker/third_party/local-inventory.json',{});
  const raw=JSON.stringify(inv);
  for(const name of ['Hunyuan3D','InstantMesh','TRELLIS.2','Depth Anything','Blender','Godot','Goo Engine','UPBGE','UniRig','Rigify','MPFB'])if(lower(raw).includes(lower(name)))out.add(name);
  return [...out];
}
const DETECTORS=[
 ['three-webgl2',()=>exists('apps/ai3d-voxel-city/client.js')||/three/i.test(readText('package.json'))||/three\.module/i.test(readText('apps/voxel-world/client.js'))],
 ['webgpu',()=>/webgpu|gpuadapter|navigator\.gpu/i.test(readText('apps/ai3d-voxel-city/client.js')+readText('apps/voxel-world/client.js'))],
 ['godot',()=>exists('services/ai3d-worker/ai3d/plugins/godot_voxel.py')||exists('project.godot')||exists('apps/hunyuan-world/project.godot')],
 ['blender',()=>exists('services/ai3d-worker/ai3d/plugins/blender_building.py')||exists('services/ai3d-worker/ai3d/plugins/procgen_maps.py')],
 ['cpu-reconstruction',()=>exists('services/ai3d-worker/ai3d/plugins/cpu_reconstruction.py')],
 ['depth-anything',()=>exists('services/ai3d-worker/ai3d/plugins/depth_anything.py')],
 ['instantmesh',()=>exists('services/ai3d-worker/ai3d/plugins/instantmesh.py')],
 ['trellis2',()=>exists('services/ai3d-worker/ai3d/plugins/trellis2.py')],
 ['hunyuan3d',()=>exists('apps/hunyuan-world')||exists('apps/hunyuan-godot')||exists('services/ai3d-worker/ai3d/plugins/hunyuan3d.py')],
 ['voxel-greedy',()=>exists('apps/ai3d-voxel-city/mesher-worker.js')||/greedy/i.test(readText('apps/voxel-world/client.js'))],
 ['goo-engine',()=>exists('third_party/goo-engine')||exists('tools/goo-engine')],
 ['upbge',()=>exists('third_party/upbge')||exists('tools/upbge')],
 ['unirig',()=>exists('third_party/unirig')||exists('tools/unirig')],
 ['rigify',()=>exists('third_party/rigify')||exists('tools/rigify')],
 ['mpfb',()=>exists('third_party/mpfb')||exists('tools/mpfb')],
 ['world-quality',()=>exists('shared/world-quality-autopilot.js')&&exists('data/world-quality-autopilot.json')]
];
const ALIASES={
 'three.js/webgl2':'three-webgl2','three.js':'three-webgl2','godot 4.7.1':'godot','blender pipeline':'blender','depth anything':'depth-anything','instantmesh':'instantmesh','trellis.2':'trellis2','hunyuan3d':'hunyuan3d','goo engine':'goo-engine','upbge':'upbge','unirig':'unirig','rigify':'rigify','mpfb':'mpfb'
};
function normalizeDeclared(name){const n=lower(name).trim();return ALIASES[n]||null}
function packageGraphicsCandidates(){
  const p=readJson('package.json',{}),deps={...(p.dependencies||{}),...(p.devDependencies||{})},known=['three','babylon','pixi','playcanvas','regl','ogl','webgpu','meshoptimizer','draco','gltf','canvas'];
  return Object.keys(deps).filter(x=>known.some(k=>lower(x).includes(k))).map(name=>({id:`package:${name}`,name,status:'runtime-package',version:deps[name]}));
}
function scan(){
  const declared=declaredTechnologyNames();
  const technologies=[];const seen=new Set();
  for(const [id,fn] of DETECTORS){const runtime=!!fn();const declaredHit=declared.some(n=>normalizeDeclared(n)===id);if(runtime||declaredHit){technologies.push({id,status:runtime?'runtime-detected':'declared-only',runtimeReady:runtime,declared:declaredHit});seen.add(id)}}
  for(const c of packageGraphicsCandidates())if(!seen.has(c.id))technologies.push({...c,runtimeReady:true,declared:false});
  const report={schemaVersion:'6.0.0',system:'WORLD_GRAPHICS_TECHNOLOGY_SCOUT',generatedAt:new Date().toISOString(),policy:'scan-before-every-quality-cycle',technologies,counts:{total:technologies.length,runtime:technologies.filter(x=>x.runtimeReady).length,declaredOnly:technologies.filter(x=>!x.runtimeReady).length},sources:['package.json','TECHNOLOGY_AUDIT.json','data/quality-scorecard.json','services/ai3d-worker/third_party/local-inventory.json','AI3D plugin files','apps runtime files'],notes:['Declared-only technology is not treated as installed runtime.','Unknown graphics packages require explicit adapter review before production mutation.']};
  fs.writeFileSync(path.join(ROOT,'WORLD_GRAPHICS_TECHNOLOGY_REPORT.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){const r=scan();console.log(`[GRAPHICS_TECH_SCOUT] ${r.counts.runtime} runtime / ${r.counts.total} known`)}
module.exports={scan,normalizeDeclared,packageGraphicsCandidates};
