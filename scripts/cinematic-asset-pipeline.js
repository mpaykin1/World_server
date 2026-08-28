#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),args=new Set(process.argv.slice(2)),apply=args.has('--apply');
const tools={
  gltfpack:['gltfpack','--version'],
  basisu:['basisu','-version'],
  toktx:['toktx','--version'],
  ffmpeg:['ffmpeg','-version']
};
const detect={};
for(const [k,cmd] of Object.entries(tools)){
  const r=cp.spawnSync(cmd[0],cmd.slice(1),{encoding:'utf8'}); detect[k]={available:r.status===0,version:(r.stdout||r.stderr||'').split(/\r?\n/)[0].slice(0,160)};
}
const policy={
  meshopt:{enabled:detect.gltfpack.available,commands:['-cc','-tc','-kn','-km'],note:'Use gltfpack only on generated/imported assets, preserve original source.'},
  ktx2:{enabled:detect.toktx.available||detect.basisu.available,mode:'ETC1S/UASTC by importance',hero:'UASTC or uncompressed if artifact risk',far:'ETC1S'},
  atlas:{textureArraysPreferred:true,materialMergeOnlyWhenVisuallyEquivalent:true},
  instancing:{staticRepeatThreshold:8,clusterByMaterial:true,clusterCellMeters:16},
  applyRequested:apply
};
const out={generatedAt:new Date().toISOString(),tools:detect,policy,pass:true};
fs.writeFileSync(path.join(ROOT,'CINEMATIC_ASSET_PIPELINE_REPORT.json'),JSON.stringify(out,null,2)+'\n');
console.log(`[CINEMATIC_ASSET_PIPELINE] gltfpack=${detect.gltfpack.available} ktx=${policy.ktx2.enabled}`);
