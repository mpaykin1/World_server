#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const KEYWORDS=['graphics','render','voxel','hunyuan','godot','blender','instantmesh','trellis','webgpu','goo','upbge','unirig','rigify','mpfb','texture','pbr','animation','lod'];
function gitRefs(){
  try{
    const out=cp.execFileSync('git',['for-each-ref','--format=%(refname:short)','refs/heads','refs/remotes'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']});
    return out.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  }catch{return[]}
}
function detect(refs=gitRefs()){
  const candidates=refs.filter(r=>KEYWORDS.some(k=>r.toLowerCase().includes(k))).map(ref=>({ref,status:'candidate-ref-only',runtimeReady:false,requiresCheckoutAndTechnologyScout:true}));
  const report={schemaVersion:'6.0.0',system:'WORLD_TECHNOLOGY_CANDIDATE_INTAKE',generatedAt:new Date().toISOString(),refsScanned:refs.length,candidates,policy:'candidate refs never count as runtime until checked out and verified by technology scout',hardGateReady:true};
  fs.writeFileSync(path.join(ROOT,'WORLD_TECHNOLOGY_CANDIDATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){const r=detect();console.log(`[TECH_CANDIDATE_INTAKE] refs=${r.refsScanned} candidates=${r.candidates.length}`)}
module.exports={detect,gitRefs};
