'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=process.cwd();
test('DreamFog quality profile has mobile and desktop fallbacks',()=>{const q=JSON.parse(fs.readFileSync(path.join(root,'data/dreamfog-quality-profile.json'),'utf8'));assert.equal(q.contract,'DREAMFOG_WORLD_QUALITY_V2');assert.ok(q.targets.desktop.minimumFps>=30);assert.ok(q.targets.mobile.minimumFps>=24);assert.equal(q.rules.mobileFallbackRequired,true);});
test('DreamFog reuses golden systems instead of replacing them',()=>{const html=fs.readFileSync(path.join(root,'apps/dreamfog-world/index.html'),'utf8');for(const token of ['ai3d-playable-runtime.js','golden-physics.js','golden-performance-autotuner.js','world-quality-autopilot.js'])assert.match(html,new RegExp(token.replaceAll('.','\\.')));});
test('DreamFog source contains adaptive atmospheric capabilities',()=>{const src=fs.readFileSync(path.join(root,'shared/dreamfog-atmosphere.js'),'utf8');for(const token of ['FogExp2','InstancedMesh','DreamFogPostFX','setTier','anomalyActive','enableAudio'])assert.ok(src.includes(token),token);});
