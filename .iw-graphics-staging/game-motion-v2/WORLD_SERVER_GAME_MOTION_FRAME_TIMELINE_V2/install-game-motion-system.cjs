#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const HERE=__dirname;
const arg=process.argv.find(x=>x.startsWith('--root=')),ROOT=path.resolve(arg?arg.slice(7):process.cwd()),payload=path.join(HERE,'payload');
const ts=new Date().toISOString().replace(/[:.]/g,'-'),backup=path.join(ROOT,'.patch-backups','game-motion-v2',ts);
function fail(m){console.error('[GAME_MOTION_INSTALL] '+m);process.exit(1)}
function cp(src,dst){const st=fs.statSync(src);if(st.isDirectory()){fs.mkdirSync(dst,{recursive:true});for(const n of fs.readdirSync(src))cp(path.join(src,n),path.join(dst,n))}else{fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}}
function backupFile(rel){const src=path.join(ROOT,rel);if(fs.existsSync(src)){const dst=path.join(backup,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}}
if(!fs.existsSync(path.join(ROOT,'package.json')))fail(`package.json not found at ${ROOT}`);if(!fs.existsSync(payload))fail('payload missing');
['package.json','AGENTS.md','.gitignore'].forEach(backupFile);cp(payload,ROOT);
const packagePath=path.join(ROOT,'package.json'),pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));pkg.scripts=pkg.scripts||{};
Object.assign(pkg.scripts,{
 'animation:verify':'node scripts/game-motion-verify.mjs',
 'animation:audit':'node scripts/game-motion-audit.mjs',
 'animation:plan':'node scripts/game-motion-plan.mjs',
 'animation:benchmark':'node scripts/game-motion-benchmark.mjs',
 'animation:gate':'node scripts/game-motion-quality-gate.mjs',
 'animation:integrate':'node scripts/game-motion-auto-integrate.mjs --apply',
 'animation:integrate:dry':'node scripts/game-motion-auto-integrate.mjs',
 'animation:manifest':'node scripts/compile-motion-manifest.mjs',
 'animation:knowledge':'node scripts/game-motion-knowledge.mjs',
 'animation:oss:check':'node scripts/animation-oss-watch.mjs',
 'animation:oss:bootstrap':'node scripts/animation-oss-bootstrap.mjs',
 'animation:gltf:check':'node scripts/game-motion-gltf-toolcheck.mjs',
 'animation:gltf:optimize':'node tools/game-motion/optimize_gltf.mjs'
});
if(pkg.scripts['release:gate']){
  pkg.scripts['release:gate']=pkg.scripts['release:gate'].replace(/\s*&&\s*npm run animation:verify/g,'').replace(/\s*&&\s*npm run animation:gate/g,'');
  pkg.scripts['release:gate']+=' && npm run animation:gate';
}
fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n');
const agentsPath=path.join(ROOT,'AGENTS.md');let agents=fs.existsSync(agentsPath)?fs.readFileSync(agentsPath,'utf8'):'';
agents=agents.replace(/<!-- GAME_MOTION_POLICY_V1:START -->[\s\S]*?<!-- GAME_MOTION_POLICY_V1:END -->\s*/g,'');
const start='<!-- GAME_MOTION_POLICY_V2:START -->',end='<!-- GAME_MOTION_POLICY_V2:END -->';
const block=`${start}
## Game Motion / Frame Timeline policy V2
- Reuse existing WorldQualityAutopilot; never create a duplicate animation quality governor.
- Every game/world change: run \`npm run animation:audit && npm run animation:plan\`. Implement all meaningful P0/P1 animation opportunities unless runtime evidence shows a performance/gameplay regression.
- Character locomotion cadence must follow real speed/distance (LocomotionClock or native equivalent) to reduce foot sliding. Do not fake walking while physics/root is stationary.
- Use MotionGraph/state-machine for multi-state characters/mechanisms, central MotionScheduler for secondary motion, and distance/visibility LOD.
- Visual-only motion must animate visual descendants, not authoritative collision roots. Physical doors/platforms must keep animation and collision synchronized.
- Prefer native/procedural/skeletal animation. Frame timeline/APNG/WebP/sprite sequences are for exact pre-rendered motion, complex effects, reversible inspection/exploded states, or when native motion is not practical.
- Preserve user-required APNG format.
- Register runtime animation adapters with \`WorldQualityAutopilot.registerAnimationAdapter\`; SAFE tier must retain gameplay-critical motion and reduce only secondary effects.
- Use deterministic procedural noise when replay/sync consistency matters.
- Before major animation work run \`npm run animation:oss:check\`. Useful compatible OSS updates: test on a branch, verify license/changelog, run bootstrap + animation gate + full release gate. Never auto-merge untested upstream updates.
- For GLB/glTF, use isolated glTF-Transform/Meshopt tooling conservatively and verify animations/rigs before and after optimization.
- Measure frame sequences with analyze_sequence.py; repair exposure flicker/seams/interpolation only when metrics/runtime observation justify it.
- Save successful patterns and root-cause fixes through \`npm run animation:knowledge\` and existing server regression/quality knowledge systems. Deduplicate.
- Fix root cause and add regression protection. Do not use SKIP to hide patch failures. Iterate until all relevant tests pass.
- Never claim 100% without real desktop + mobile/runtime evidence for affected games.
${end}`;
const rx=new RegExp(start.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[\\s\\S]*?'+end.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
agents=rx.test(agents)?agents.replace(rx,block):agents.trimEnd()+'\n\n'+block+'\n';fs.writeFileSync(agentsPath,agents);
const ignorePath=path.join(ROOT,'.gitignore');let ig=fs.existsSync(ignorePath)?fs.readFileSync(ignorePath,'utf8'):'';
for(const line of ['tools/game-motion/.venv/','tools/game-motion/vendor/','tools/game-motion/node/node_modules/'])if(!ig.split(/\r?\n/).includes(line))ig+=`${ig.endsWith('\n')||!ig?'':'\n'}${line}\n`;fs.writeFileSync(ignorePath,ig);
console.log(`[GAME_MOTION_INSTALL] V2 installed to ${ROOT}`);console.log(`[GAME_MOTION_INSTALL] backups: ${backup}`);
console.log('[GAME_MOTION_INSTALL] NEXT: npm run animation:oss:bootstrap');
console.log('[GAME_MOTION_INSTALL] THEN: npm run animation:audit && npm run animation:plan && npm run animation:integrate:dry');
console.log('[GAME_MOTION_INSTALL] VERIFY: npm run animation:gate && npm run release:gate');
