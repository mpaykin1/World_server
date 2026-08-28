#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
const file=process.argv[2];if(!file){console.error('Usage: node scripts/compile-motion-manifest.mjs <manifest.json> [output.json]');process.exit(2)}
const ROOT=process.cwd(),src=path.resolve(ROOT,file),out=path.resolve(ROOT,process.argv[3]||file.replace(/\.json$/i,'.compiled.json'));
const doc=JSON.parse(fs.readFileSync(src,'utf8')),errors=[],ids=new Set();
if(doc.schemaVersion!=='1.0.0')errors.push('schemaVersion must be 1.0.0');
if(!Array.isArray(doc.motions))errors.push('motions must be an array');
const types=new Set(['sway','bob','spin','pulse','breathe','timeline','frame-sequence','exploded','locomotion','camera-shake','state-graph']);
const sources=new Set(['time','speed','distance','impact','touch','mouse','audio','state','manual']);
for(const [i,m] of (doc.motions||[]).entries()){
  if(!m?.id||ids.has(m.id))errors.push(`motions[${i}].id missing/duplicate`);else ids.add(m.id);
  if(!m?.target)errors.push(`motions[${i}].target missing`);
  if(!types.has(m?.type))errors.push(`motions[${i}].type invalid`);
  if(!sources.has(m?.trigger?.source))errors.push(`motions[${i}].trigger.source invalid`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
const compiled={schemaVersion:'1.0.0',game:doc.game||null,generatedAt:new Date().toISOString(),
  motions:doc.motions.map(m=>({...m,platforms:m.platforms?.length?m.platforms:['web','godot','roblox'],quality:{secondary:m.quality?.secondary!==false,minTier:m.quality?.minTier||'SAFE',...(m.quality||{})}}))};
fs.writeFileSync(out,JSON.stringify(compiled,null,2)+'\n');console.log(`[MOTION_MANIFEST] PASS motions=${compiled.motions.length} output=${path.relative(ROOT,out)}`);
