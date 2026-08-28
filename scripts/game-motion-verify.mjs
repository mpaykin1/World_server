#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const ROOT=process.cwd(),required=[
 'shared/game-motion-engine.js','shared/game-motion-three-adapter.js','scripts/game-motion-audit.mjs','scripts/game-motion-plan.mjs',
 'scripts/game-motion-auto-integrate.mjs','scripts/animation-oss-watch.mjs','scripts/animation-oss-bootstrap.mjs',
 'scripts/game-motion-benchmark.mjs','scripts/game-motion-quality-gate.mjs','scripts/compile-motion-manifest.mjs','scripts/game-motion-knowledge.mjs',
 'tools/game-motion/extract_frames.py','tools/game-motion/optimize_frames.py','tools/game-motion/make_apng.py','tools/game-motion/pack_spritesheet.py',
 'tools/game-motion/analyze_sequence.py','tools/game-motion/stabilize_exposure.py','tools/game-motion/interpolate_video.py','tools/game-motion/blend_seam.py',
 'tools/game-motion/optimize_gltf.mjs','data/game-motion-policy.json','data/game-motion-oss-registry.json','data/game-motion-manifest.schema.json',
 'data/game-motion-presets.json','adapters/godot/GameMotionDriver.gd','adapters/roblox/GameMotionDriver.luau'
];
const missing=required.filter(p=>!fs.existsSync(path.join(ROOT,p)));let packagePass=false,gatePass=false,autopilotPass=true,agentsPass=false;
try{const p=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));packagePass=['animation:verify','animation:audit','animation:plan','animation:gate','animation:benchmark','animation:integrate','animation:oss:check','animation:oss:bootstrap','animation:knowledge'].every(k=>p.scripts?.[k]);gatePass=String(p.scripts?.['release:gate']||'').includes('animation:gate')}catch{}
try{const s=fs.readFileSync(path.join(ROOT,'shared/world-quality-autopilot.js'),'utf8');autopilotPass=s.includes('registerAnimationAdapter')}catch{autopilotPass=true}
try{agentsPass=fs.readFileSync(path.join(ROOT,'AGENTS.md'),'utf8').includes('GAME_MOTION_POLICY_V2:START')}catch{}
const unit=spawnSync(process.execPath,['--test',path.join(ROOT,'test/game-motion.test.cjs')],{stdio:'inherit'});
let pyPass=true;
for(const py of required.filter(x=>x.endsWith('.py'))){const cmd=process.platform==='win32'?'python':'python3',r=spawnSync(cmd,['-m','py_compile',path.join(ROOT,py)],{stdio:'ignore'});if(r.status!==0){pyPass=false;break}}
const report={schemaVersion:'2.0.0',system:'GAME_MOTION_VERIFY',generatedAt:new Date().toISOString(),missing,packagePass,gatePass,autopilotPass,agentsPass,unitPass:unit.status===0,pythonSyntaxPass:pyPass,pass:missing.length===0&&packagePass&&gatePass&&autopilotPass&&agentsPass&&unit.status===0&&pyPass};
fs.writeFileSync(path.join(ROOT,'GAME_MOTION_VERIFY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GAME_MOTION_VERIFY] pass=${report.pass} missing=${missing.length} package=${packagePass} gate=${gatePass} autopilot=${autopilotPass} agents=${agentsPass} unit=${unit.status===0} python=${pyPass}`);
if(!report.pass)process.exitCode=1;
