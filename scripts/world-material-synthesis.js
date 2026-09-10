#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {buildMaterialProfiles}=require('../lib/world-quality-material-profiler');
const {synthesizePbrProfiles,estimateTextureBudget}=require('../lib/world-quality-pbr-synthesizer');
const {compileRegistry}=require('../lib/material-forge');
const ROOT=process.cwd();
function readJson(p,f=null){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
const candidates=['apps/ai3d-voxel-city/default-city.json','data/default-city.json','WORLD_SAMPLE.json'];
let world=null,source=null;for(const p of candidates){const x=readJson(p);if(x&&Array.isArray(x.palette)){world=x;source=p;break}}
const palette=world?.palette||[0x40363a,0xffb45f,0x242028,0x6d4332,0x43523f,0x8f5660];
const base=buildMaterialProfiles(palette);const pbr=synthesizePbrProfiles(base,{seed:world?.qualityAutopilot?.seed||'wqa4'});
const forge=compileRegistry({root:ROOT,verifyFiles:true});
if(!forge.ok)throw new Error(`Material Forge invalid: ${forge.errors.join('; ')}`);
const forgeMaterials=Object.values(forge.registry.materials),armorPaintMaterials=forgeMaterials.filter(item=>item.source.tool==='ArmorPaint');
const report={schemaVersion:'4.1.0',system:'WORLD_MATERIAL_SYNTHESIS',generatedAt:new Date().toISOString(),source:source||'fallback-palette-for-capability-check',profiles:pbr.length,proceduralOnly:true,destructiveTextureBake:false,budgets:Object.fromEntries(['SAFE','BALANCED','HIGH','ULTRA'].map(t=>[t,estimateTextureBudget(pbr,t)])),materialForge:{schemaVersion:forge.registry.schemaVersion,sourceHash:forge.registry.sourceHash,registeredMaterials:forgeMaterials.length,armorPaintMaterials:armorPaintMaterials.length,verifiedAuthoredMapVariants:armorPaintMaterials.reduce((sum,item)=>sum+Object.values(item.maps||{}).reduce((count,variants)=>count+variants.length,0),0),adaptiveRuntimeBinder:true,proceduralFallback:true,runtime16kForbidden:true},sample:pbr.slice(0,12)};
fs.writeFileSync(path.join(ROOT,'WORLD_MATERIAL_SYNTHESIS_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_MATERIAL_SYNTHESIS_V4] ${pbr.length} PBR profiles · forge=${forgeMaterials.length} · ArmorPaint=${armorPaintMaterials.length} · source=${report.source}`);
