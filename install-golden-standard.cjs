#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const cp=require('child_process');

const ROOT=process.cwd();
const PAYLOAD=path.join(__dirname,'payload');
const touched=new Set();
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backupRoot=path.join(ROOT,'.golden-backup',stamp);

function abs(p){return path.join(ROOT,p);}
function read(p){return fs.readFileSync(abs(p),'utf8');}
function backup(p){
  if(touched.has(p) || !fs.existsSync(abs(p))) return;
  const dst=path.join(backupRoot,p);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(abs(p),dst);
  touched.add(p);
}
function write(p,s){
  backup(p);
  fs.mkdirSync(path.dirname(abs(p)),{recursive:true});
  fs.writeFileSync(abs(p),s);
}
function patch(p,from,to,label){
  const s=read(p);
  if(s.includes(to)){console.log('already:',label);return;}
  if(!s.includes(from)) throw new Error(`Cannot patch ${label}: expected current-master pattern not found in ${p}`);
  write(p,s.replace(from,to));
  console.log('patched:',label);
}
function insertBefore(p,needle,insert,label){
  const s=read(p);
  if(s.includes(insert.trim())){console.log('already:',label);return;}
  if(!s.includes(needle)) throw new Error(`Cannot insert ${label}: anchor not found in ${p}`);
  write(p,s.replace(needle,insert+needle));
  console.log('inserted:',label);
}
function ensureBeforeBodyClose(p,markup,marker,label){
  const src=read(p);
  if(src.includes(marker)){console.log('already:',label);return;}
  if(!/<\/body>/i.test(src)) throw new Error(`Cannot install ${label}: </body> missing in ${p}`);
  write(p,src.replace(/<\/body>/i,markup+'\n</body>'));
  console.log('installed:',label);
}
function appendOnce(p,code,marker,label){
  const src=read(p);
  if(src.includes(marker)){console.log('already:',label);return;}
  write(p,src+'\n'+code+'\n');
  console.log('appended:',label);
}
function copyPayload(rel,dest=rel){
  write(dest,fs.readFileSync(path.join(PAYLOAD,rel),'utf8'));
  console.log('installed:',dest);
}

for(const p of ['package.json','apps/voxel-world/client.js','apps/ai3d-voxel-city/client.js','apps/catalog/client.js','apps/catalog/index.html','api/apps.js','playwright.config.js']){
  if(!fs.existsSync(abs(p))) throw new Error(`Run from World_server repo root; missing ${p}`);
}

// 1) Canonical runtime + deny-by-default release registry + direct world menu
copyPayload('shared/ai3d-playable-runtime.js');
copyPayload('shared/golden-catalog-menu.js');
copyPayload('api/apps.js');
copyPayload('data/app-release-registry.json');
copyPayload('data/golden-components.json');
copyPayload('data/quality-scorecard.json');
copyPayload('data/error-prevention-registry.json');
copyPayload('data/app-capabilities.json');
copyPayload('scripts/propagate-golden-components.js');
copyPayload('scripts/quality-governance.js');
copyPayload('scripts/quality-event.js');
copyPayload('scripts/check-quality-governance.js');
copyPayload('docs/QUALITY_GOVERNANCE.md');
copyPayload('data/quality-policy.json');
copyPayload('data/quality-baseline.json');
copyPayload('data/quality-evidence.json');
copyPayload('data/quality-migrations.json');
copyPayload('data/quality-history.json');
copyPayload('scripts/quality-regression-lib.js');
copyPayload('scripts/quality-regression-gate.js');
copyPayload('scripts/quality-score.js');
copyPayload('scripts/quality-accept-baseline.js');
copyPayload('scripts/quality-diff.js');
copyPayload('test/quality-regression.test.js');
copyPayload('.github/workflows/quality-regression.yml');
copyPayload('docs/NO_REGRESSION_QUALITY_LOCK.md');
copyPayload('scripts/check-golden-standard.js');
copyPayload('e2e/golden-release.spec.js');
copyPayload('playwright.config.js');
copyPayload('shared/golden-ui-shell.js');
copyPayload('shared/golden-ui-shell.css');
copyPayload('shared/golden-physics.js');
copyPayload('data/ui-policy.json');
copyPayload('data/visual-quality-policy.json');
copyPayload('data/control-policy.json');
copyPayload('data/collision-policy.json');
copyPayload('data/technology-registry.json');
copyPayload('scripts/project-quality-reviewer.js');
copyPayload('scripts/quality-master-report.js');
copyPayload('scripts/technology-audit.js');
copyPayload('test/golden-physics.test.js');
copyPayload('e2e/golden-ui-quality.spec.js');
copyPayload('e2e/golden-mobile-behavior.spec.js');
copyPayload('e2e/golden-controls.spec.js');
copyPayload('data/quality-model.json');
copyPayload('data/quality-evidence-state.json');
copyPayload('data/system-contracts.json');
copyPayload('data/visual-baselines.json');
copyPayload('scripts/duplicate-system-review.js');
copyPayload('scripts/system-contract-review.js');
copyPayload('scripts/capture-regressions.js');
copyPayload('scripts/visual-regression.js');
copyPayload('scripts/technology-runtime-health.js');
copyPayload('scripts/evidence-quality-score.js');
copyPayload('data/quality-growth-policy.json');
copyPayload('data/quality-debt.json');
copyPayload('scripts/quality-growth-engine.js');
copyPayload('scripts/quality-improvement-planner.js');
copyPayload('scripts/quality-trend-monitor.js');
copyPayload('scripts/test-gap-synthesizer.js');
copyPayload('scripts/app-quality-matrix.js');
copyPayload('scripts/quality-promotion-candidate.js');
copyPayload('scripts/auto-quality-cycle.js');
copyPayload('test/quality-growth.test.js');
copyPayload('data/autofix-recipes.json');
copyPayload('scripts/quality-autofix.js');
copyPayload('.github/workflows/quality-autofix-pr.yml');
copyPayload('.github/workflows/quality-canary.yml');
copyPayload('scripts/post-deploy-smoke.js');
copyPayload('shared/quality-telemetry.js');
copyPayload('api/quality-telemetry.js');
copyPayload('data/performance-budgets.json');
copyPayload('e2e/performance-budgets.spec.js');
copyPayload('e2e/hud-visual-audit.spec.js');
copyPayload('data/golden-asset-rules.json');
copyPayload('scripts/golden-asset-bot.js');
copyPayload('data/real-device-provider.json');
copyPayload('scripts/real-device-gate.js');
copyPayload('scripts/quality-bisect-check.js');
copyPayload('.github/workflows/quality-bisect.yml');
copyPayload('data/technology-orchestrator.json');
copyPayload('scripts/technology-orchestrator.js');
copyPayload('services/ai3d-worker/ai3d/plugins/instantmesh.py');
copyPayload('scripts/godot-runtime-smoke.js');
copyPayload('.github/workflows/visual-baseline-candidates.yml');
copyPayload('e2e/visual-candidates.spec.js');
copyPayload('scripts/approve-visual-baseline.js');
copyPayload('test/quality-mutation.test.js');
copyPayload('scripts/test-stability-runner.js');
copyPayload('scripts/quality-issue-sync.js');
copyPayload('scripts/configure-branch-protection.sh');
copyPayload('supabase/migrations/20260823063700_quality_telemetry.sql');
copyPayload('api/quality-summary.js');
copyPayload('scripts/production-quality-pull.js');
copyPayload('.github/workflows/production-quality-feedback.yml');
copyPayload('test/quality-fuzz.test.js');
copyPayload('scripts/quality-impact-graph.js');
copyPayload('scripts/quality-changed-impact.js');
copyPayload('data/autofix-learning.json');
copyPayload('scripts/quality-learn-fix.js');
copyPayload('scripts/promote-learned-autofix.js');
copyPayload('data/patch-synthesis-policy.json');
copyPayload('scripts/quality-patch-synthesizer.js');
copyPayload('e2e/perceptual-visual.spec.js');
copyPayload('scripts/perceptual-visual-gate.js');
copyPayload('services/ai3d-worker/ai3d/plugins/gpu_router.py');
copyPayload('data/gpu-routing.json');
copyPayload('.github/workflows/quality-progressive-rollout.yml');
copyPayload('scripts/vercel-deployment-bisect.sh');
copyPayload('scripts/vercel-bisect-test.sh');
copyPayload('scripts/quality-self-evolve.js');
copyPayload('data/patch-tournament-policy.json');
copyPayload('scripts/quality-patch-tournament.js');
copyPayload('test/patch-tournament.test.js');
copyPayload('scripts/quality-root-cause.js');
copyPayload('scripts/quality-knowledge-graph.js');
copyPayload('data/quality-risk-model.json');
copyPayload('scripts/quality-risk-predictor.js');
copyPayload('data/regression-test-templates.json');
copyPayload('scripts/generate-regression-tests.js');
copyPayload('test/generated/controls-inverted-camera-relative.test.js');
copyPayload('test/generated/stairs-collision-broken.test.js');
copyPayload('test/generated/wall-collision-broken.test.js');
copyPayload('test/generated/false-green-assertion.test.js');
copyPayload('data/golden-component-evolution.json');
copyPayload('scripts/promote-golden-success.js');
copyPayload('shared/golden-performance-autotuner.js');
copyPayload('test/performance-autotuner.test.js');
copyPayload('test/regression-generator.test.js');
copyPayload('services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py');
copyPayload('services/ai3d-worker/tools/mesh_quality_optimize.py');
copyPayload('scripts/asset-dedup-cache.js');
copyPayload('data/quality-cost-model.json');
copyPayload('scripts/quality-cost-optimizer.js');
copyPayload('data/gpu-autoscaling.json');
copyPayload('scripts/gpu-autoscaler.js');
copyPayload('data/visual-critic-policy.json');
copyPayload('scripts/ai-visual-critic.js');
copyPayload('scripts/quality-experiment-engine.js');
copyPayload('scripts/durable-quality-cycle.js');
copyPayload('DESKTOP_AI_INSTALL_AND_VERIFY.md');
copyPayload('WORK_IN_PROGRESS.md');
copyPayload('data/desktop-ai-policy.json');
copyPayload('scripts/check-desktop-ai-protocol.js');
copyPayload('data/silent-cpu-autopilot-policy.json');
copyPayload('data/autopilot-projects.json');
copyPayload('data/quality-improvement-memory.json');
copyPayload('data/cpu-night-learning-model.json');
copyPayload('supabase/migrations/20260824010000_silent_cpu_autopilot.sql');
copyPayload('scripts/autopilot-project-priority.js');
copyPayload('scripts/cpu-quality-learner.js');
copyPayload('scripts/autopilot-task-planner.js');
copyPayload('scripts/cpu-budget-gate.js');
copyPayload('scripts/cross-project-learning.js');
copyPayload('scripts/cpu-nightly-planner.js');
copyPayload('scripts/cpu-nightly-report.js');
copyPayload('scripts/check-cpu-only-autopilot.js');
copyPayload('api/quality-autopilot-nightly.js');
copyPayload('api/quality-autopilot-worker.js');
copyPayload('api/quality-autopilot-summary.js');
copyPayload('desktop/cpu-night-autopilot.cjs');
copyPayload('desktop/install-cpu-night-task.ps1');
copyPayload('desktop/run-cpu-night-now.cmd');
copyPayload('docs/CPU_NIGHT_AUTOPILOT.md');
copyPayload('test/cpu-night-autopilot.test.js');
copyPayload('data/cpu-genetic-optimizer-policy.json');
copyPayload('data/runtime-quality-profile.json');
copyPayload('scripts/cpu-genetic-optimizer.js');
copyPayload('scripts/cpu_ssim_compare.py');
copyPayload('data/local-cpu-code-model.json');
copyPayload('scripts/local-cpu-code-model.js');
copyPayload('scripts/cpu-patch-tournament.js');
copyPayload('data/incremental-test-map.json');
copyPayload('scripts/incremental-test-selector.js');
copyPayload('scripts/automatic-test-synthesizer.js');
copyPayload('data/cpu-texture-policy.json');
copyPayload('scripts/cpu_texture_factory.py');
copyPayload('scripts/cpu_mesh_factory.py');
copyPayload('scripts/cpu-mesh-scan.js');
copyPayload('scripts/project-quality-curriculum.js');
copyPayload('data/failure-knowledge-base.json');
copyPayload('data/success-knowledge-base.json');
copyPayload('scripts/quality-knowledge-learning.js');
copyPayload('data/adaptive-night-budget-policy.json');
copyPayload('scripts/adaptive-night-budget.js');
copyPayload('data/desktop-ai-error-closure-policy.json');
copyPayload('scripts/desktop-ai-error-closure.js');
copyPayload('DESKTOP_AI_EXTERNAL_BLOCKERS.json');
copyPayload('test/v12-cpu-evolution.test.js');
copyPayload('test/desktop-ai-error-closure.test.js');
copyPayload('test/cpu-asset-tools.test.js');
copyPayload('data/cpu-visual-ensemble-policy.json');
copyPayload('scripts/cpu_visual_ensemble.py');
copyPayload('data/invariant-miner-policy.json');
copyPayload('scripts/quality-invariant-miner.js');
copyPayload('data/test-cache-policy.json');
copyPayload('scripts/test-cache-runner.js');
copyPayload('scripts/test-cache-smoke.js');
copyPayload('data/night-checkpoint-policy.json');
copyPayload('scripts/night-checkpoint.js');
copyPayload('data/bayesian-quality-policy.json');
copyPayload('scripts/bayesian-quality-predictor.js');
copyPayload('data/golden-pattern-policy.json');
copyPayload('data/golden-patterns.json');
copyPayload('scripts/promote-golden-pattern.js');
copyPayload('data/asset-similarity-policy.json');
copyPayload('scripts/asset_similarity_scan.py');
copyPayload('scripts/cpu_collision_simplifier.py');
copyPayload('data/hardware-profile-policy.json');
copyPayload('scripts/hardware-fingerprint.js');
copyPayload('shared/golden-device-profile.js');
copyPayload('data/self-calibration-policy.json');
copyPayload('scripts/quality-self-calibration.js');
copyPayload('data/desktop-ai-fix-loop-policy.json');
copyPayload('scripts/desktop-ai-fix-loop.js');
copyPayload('test/v13-self-calibrating.test.js');
copyPayload('test/v13-visual-assets.test.js');
copyPayload('test/v13-invariant-golden.test.js');
copyPayload('test/v13-desktop-fix-loop.test.js');
copyPayload('requirements-cpu-quality.txt');
copyPayload('scripts/desktop-ai-new-task.js');

// 2) Known inverted first-person formula — Voxel World
patch(
  'apps/voxel-world/client.js',
  "const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw); const vx=((s/len)*cy+(f/len)*sy)*speed, vz=((s/len)*sy-(f/len)*cy)*speed;",
  "const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw); const vx=((s/len)*cy-(f/len)*sy)*speed, vz=(-(s/len)*sy-(f/len)*cy)*speed;",
  'voxel-world camera-relative directions'
);
patch(
  'apps/voxel-world/client.js',
  "const sy=Math.sin(player.yaw),cy=Math.cos(player.yaw); const vx=((s/len)*cy-(f/len)*sy)*speed, vz=(-(s/len)*sy-(f/len)*cy)*speed;",
  "const move=window.GameGoldenPhysics.canonicalXZ(player.yaw,f/len,s/len,speed); const vx=move.x, vz=move.z;",
  'voxel-world shared canonical movement basis'
);

// Step-up helper for voxel world
insertBefore(
  'apps/voxel-world/client.js',
  "function physics(dt){",
  "const GOLDEN_STEP_HEIGHTS=[.25,.5,.75,1.0,1.05];\nfunction goldenHorizontal(axis,amount,allowStep){\n  if(!amount)return true;\n  const start=player.pos.clone();\n  const target=start.clone();target[axis]+=amount;\n  if(!collides(target.x,target.y,target.z)){player.pos[axis]=target[axis];return true;}\n  if(allowStep){\n    for(const h of GOLDEN_STEP_HEIGHTS){\n      const raised=start.clone();raised.y+=h;\n      if(collides(raised.x,raised.y,raised.z))continue;\n      raised[axis]+=amount;\n      if(collides(raised.x,raised.y,raised.z))continue;\n      player.pos.copy(raised);player.vel.y=Math.max(0,player.vel.y);return true;\n    }\n  }\n  player.vel[axis]=0;return false;\n}\n",
  'voxel-world step-up helper'
);
patch(
  'apps/voxel-world/client.js',
  "function physics(dt){\n  const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-mobileMove.y; const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+mobileMove.x; const len=Math.hypot(f,s)||1, speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?RUN:WALK;",
  "function physics(dt){\n  const wasGrounded=player.onGround;\n  const f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0)-mobileMove.y; const s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)+mobileMove.x; const len=Math.hypot(f,s)||1, speed=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?RUN:WALK;",
  'voxel-world grounded snapshot'
);
patch(
  'apps/voxel-world/client.js',
  "moveAxis('x',player.vel.x*dt); moveAxis('z',player.vel.z*dt); moveAxis('y',player.vel.y*dt);",
  "goldenHorizontal('x',player.vel.x*dt,wasGrounded); goldenHorizontal('z',player.vel.z*dt,wasGrounded); moveAxis('y',player.vel.y*dt);",
  'voxel-world horizontal step collision'
);

// 3) AI3D direction + step-up + touch look + diagnostic view setter
patch(
  'apps/ai3d-voxel-city/client.js',
  "const wishX = (s*cos + f*sin) * speed;\n  const wishZ = (s*sin - f*cos) * speed;",
  "const wishX = (s*cos - f*sin) * speed;\n  const wishZ = (-s*sin - f*cos) * speed;",
  'ai3d camera-relative directions'
);
patch(
  'apps/ai3d-voxel-city/client.js',
  "const sin=Math.sin(yaw), cos=Math.cos(yaw);\n  const wishX = (s*cos - f*sin) * speed;\n  const wishZ = (-s*sin - f*cos) * speed;",
  "const move=window.GameGoldenPhysics.canonicalXZ(yaw,f,s,speed);\n  const wishX=move.x;\n  const wishZ=move.z;",
  'ai3d shared canonical movement basis'
);
insertBefore(
  'apps/ai3d-voxel-city/client.js',
  "function updatePlayer(dt){",
  "const GOLDEN_STEP_HEIGHTS=[.25,.5,.75,1.0,1.05];\nfunction goldenPlayableHorizontal(axis,delta,allowStep){\n  if(!delta)return true;\n  const start={x:player.x,y:player.y,z:player.z};\n  const tx=axis==='x'?start.x+delta:start.x;\n  const tz=axis==='z'?start.z+delta:start.z;\n  if(!collidesAt(tx,start.y,tz)){player[axis]+=delta;return true;}\n  if(allowStep){\n    for(const h of GOLDEN_STEP_HEIGHTS){\n      const ry=start.y+h;\n      if(collidesAt(start.x,ry,start.z))continue;\n      if(collidesAt(tx,ry,tz))continue;\n      player.y=ry;player[axis]+=delta;player.vy=Math.max(0,player.vy);return true;\n    }\n  }\n  return false;\n}\n",
  'ai3d step-up helper'
);
patch(
  'apps/ai3d-voxel-city/client.js',
  "function updatePlayer(dt){\n  if(!playableMode || !world) return;",
  "function updatePlayer(dt){\n  if(!playableMode || !world) return;\n  const wasGrounded=player.onGround;",
  'ai3d grounded snapshot'
);
const ai3dHorizontalOld = `  // horizontal move with collision
  let nx = player.x + wishX * dt;
  if(!collidesAt(nx, player.y, player.z)) player.x = nx;
  else {
    // slide along x separately? try small steps
    if(!collidesAt(player.x + wishX*dt*0.5, player.y, player.z)) player.x += wishX*dt*0.5;
  }
  let nz = player.z + wishZ * dt;
  if(!collidesAt(player.x, player.y, nz)) player.z = nz;
  else {
    if(!collidesAt(player.x, player.y, player.z + wishZ*dt*0.5)) player.z += wishZ*dt*0.5;
  }`;
const ai3dHorizontalNew = `  // Golden Standard: collision is axis-separated and can climb <= 1 voxel stairs.
  goldenPlayableHorizontal('x',wishX*dt,wasGrounded);
  goldenPlayableHorizontal('z',wishZ*dt,wasGrounded);`;
patch('apps/ai3d-voxel-city/client.js',ai3dHorizontalOld,ai3dHorizontalNew,'ai3d step collision');

insertBefore(
  'apps/ai3d-voxel-city/client.js',
  "  addEventListener('resize',fitCameras);",
  "  addEventListener('goldenlook',e=>{if(!playableMode)return;const d=e.detail||{};yaw-=(Number(d.dx)||0)*.005;pitch=Math.max(-1.45,Math.min(1.45,pitch-(Number(d.dy)||0)*.005));player.yaw=yaw;player.pitch=pitch;});\n",
  'ai3d touch-look'
);
patch(
  'apps/ai3d-voxel-city/client.js',
  "stats(){return {fps:measuredFps,pixelRatio:dynamicPixelRatio,renderer:renderer?.info?.render,mesher:mesherStats,chunks:chunkObjects.size, voxels:world?world.voxels.length:0, player:{x:player.x,y:player.y,z:player.z,onGround:player.onGround, playable:playableMode}, defaultCityLoaded};},",
  "setPlayerView(nextYaw,nextPitch=0){yaw=Number(nextYaw)||0;pitch=Math.max(-1.45,Math.min(1.45,Number(nextPitch)||0));player.yaw=yaw;player.pitch=pitch;},\n  stats(){return {fps:measuredFps,pixelRatio:dynamicPixelRatio,renderer:renderer?.info?.render,mesher:mesherStats,chunks:chunkObjects.size, voxels:world?world.voxels.length:0, player:{x:player.x,y:player.y,z:player.z,yaw,onGround:player.onGround, playable:playableMode}, defaultCityLoaded};},",
  'ai3d runtime diagnostics'
);

// Existing false-green assertion
patch(
  'e2e/ai3d-voxel-city-autoplay.spec.js',
  "expect(spawnState.autoplayState?.spawned).toBeTruthy;",
  "expect(spawnState.autoplayState?.spawned).toBeTruthy();",
  'fix false-green autoplay assertion'
);

// 4) Catalog: true screen-right, direct menu, mobile runtime, touch look.
patch(
  'apps/catalog/client.js',
  "const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));",
  "const right = new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));",
  'catalog A/D direction'
);
patch(
  'apps/catalog/client.js',
  "const right = new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));",
  "const basis=window.GameGoldenStandard?.basisFromForward(forward.x,forward.z);\n  const right = basis ? new THREE.Vector3(basis.right.x,0,basis.right.z) : new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));",
  'catalog shared canonical screen-right'
);
insertBefore(
  'apps/catalog/client.js',
  "renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());",
  "addEventListener('goldenlook',e=>{const d=e.detail||{};yaw-=(Number(d.dx)||0)*.005;pitch=Math.max(.15,Math.min(.9,pitch-(Number(d.dy)||0)*.003));});\n",
  'catalog touch-look'
);
insertBefore(
  'apps/catalog/index.html',
  '<script type="module" src="./client.js"></script>',
  '<script src="/shared/ai3d-playable-runtime.js"></script><script src="/shared/golden-catalog-menu.js"></script>',
  'catalog direct menu + mobile runtime'
);

// 5) Survival is quarantined, but install mobile input/look now so bringing it to certified later is smaller.
insertBefore(
  'apps/survival/index.html',
  '<script type="module" src="./client.js"></script>',
  '<script src="/shared/ai3d-playable-runtime.js"></script>',
  'survival mobile runtime'
);
insertBefore(
  'apps/survival/client.js',
  "renderer.domElement.addEventListener('click',()=>renderer.domElement.requestPointerLock?.());",
  "addEventListener('goldenlook',e=>{const d=e.detail||{};yaw-=(Number(d.dx)||0)*.005;pitch=Math.max(.08,Math.min(.95,pitch-(Number(d.dy)||0)*.003));});\n",
  'survival touch-look'
);


// 5b) Shared Golden UI/physics become the single reusable implementation.
for(const app of ['catalog','voxel-world','ai3d-voxel-city','survival','world-sharabass']){
  const html=`apps/${app}/index.html`;
  if(!fs.existsSync(abs(html))) continue;
  ensureBeforeBodyClose(
    html,
    '<link rel="stylesheet" href="/shared/golden-ui-shell.css"><script src="/shared/golden-physics.js"></script><script src="/shared/golden-ui-shell.js"></script>',
    '/shared/golden-ui-shell.js',
    `${app} Golden compact UI + physics`
  );
}

// Voxel World now exposes testable runtime state without changing graphics/gameplay.
appendOnce(
  'apps/voxel-world/client.js',
  `window.VoxelWorldRuntime={
    stats(){return {player:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.yaw,onGround:player.onGround},renderer:renderer?.info?.render,pixelRatio:renderer?.getPixelRatio?.()||1};},
    setView(nextYaw,nextPitch=0){player.yaw=Number(nextYaw)||0;player.pitch=Number(nextPitch)||0;}
  };`,
  'window.VoxelWorldRuntime=',
  'voxel-world behavioral diagnostics'
);


// 5c) Production quality telemetry is shared and privacy-minimal.
for(const app of ['catalog','voxel-world','ai3d-voxel-city','survival','world-sharabass']){
  const html=`apps/${app}/index.html`;
  if(!fs.existsSync(abs(html))) continue;
  ensureBeforeBodyClose(
    html,
    '<script src="/shared/quality-telemetry.js"></script>',
    '/shared/quality-telemetry.js',
    `${app} quality telemetry`
  );
}

// V8: real InstantMesh only. Remove diagnostic placeholder engine selection.
patch(
  'services/ai3d-worker/ai3d/runner.py',
  '        if self.cpu.available():\\n            return "cpu_reconstruction", self.cpu\\n        if self.instantmesh.available():\\n            return "instantmesh_placeholder", self.instantmesh\\n        return "placeholder_diagnostic", self.instantmesh',
  '        if self.cpu.available():\\n            return "cpu_reconstruction", self.cpu\\n        raise RuntimeError("No verified real Image-to-3D engine is runnable; placeholder success is forbidden.")',
  'forbid fake InstantMesh/placeholder success'
);


// V9: remote GPU router integrates real InstantMesh/TRELLIS/Hunyuan workers with failover.
patch(
  'services/ai3d-worker/ai3d/runner.py',
  'from .plugins.voxel_city import VoxelCityEngine',
  'from .plugins.voxel_city import VoxelCityEngine\\nfrom .plugins.gpu_router import RemoteGPU3DRouter',
  'import remote GPU router'
);
patch(
  'services/ai3d-worker/ai3d/runner.py',
  '        self.voxel_city = VoxelCityEngine()',
  '        self.voxel_city = VoxelCityEngine()\\n        self.gpu_router = RemoteGPU3DRouter()',
  'initialize remote GPU router'
);
patch(
  'services/ai3d-worker/ai3d/runner.py',
  '            "godot_voxel_factory": self.godot.plugin_status(),',
  '            "godot_voxel_factory": self.godot.plugin_status(),\\n            "remote_gpu_router": self.gpu_router.status(),',
  'report remote GPU router'
);
patch(
  'services/ai3d-worker/ai3d/runner.py',
  '    def _choose_image3d_engine(self) -> tuple[str, object]:\\n        if self.trellis.available():',
  '    def _choose_image3d_engine(self) -> tuple[str, object]:\\n        for _engine in ("trellis2", "instantmesh", "hunyuan3d"):\\n            if self.gpu_router.available(_engine):\\n                return "remote_" + _engine, self.gpu_router\\n        if self.trellis.available():',
  'prefer healthy remote GPU engines'
);
patch(
  'services/ai3d-worker/ai3d/runner.py',
  '            if engine_name == "trellis2":\\n                progress(28, "TRELLIS.2: generating 3D geometry and PBR materials")',
  '            if engine_name.startswith("remote_"):\\n                _remote_engine = engine_name.removeprefix("remote_")\\n                progress(28, f"Remote GPU {_remote_engine}: generating verified 3D artifact")\\n                glb_path = engine.run(_remote_engine, input_path, job_dir / "model.glb", params)\\n                progress(90, f"Validating remote {_remote_engine} GLB")\\n            elif engine_name == "trellis2":\\n                progress(28, "TRELLIS.2: generating 3D geometry and PBR materials")',
  'execute remote GPU engine'
);



// V13 hardware/device quality profile.
for(const app of ['voxel-world','ai3d-voxel-city']){
  const html=`apps/${app}/index.html`;
  if(fs.existsSync(abs(html))) ensureBeforeBodyClose(
    html,
    '<script src="/shared/golden-device-profile.js"></script>',
    '/shared/golden-device-profile.js',
    `${app} device quality profile`
  );
}

// V10 performance autotuner.
for(const app of ['voxel-world','ai3d-voxel-city']){
  const html=`apps/${app}/index.html`;
  if(fs.existsSync(abs(html))) ensureBeforeBodyClose(html,'<script src="/shared/golden-performance-autotuner.js"></script>','/shared/golden-performance-autotuner.js',`${app} performance autotuner`);
  const client=`apps/${app}/client.js`;
  if(fs.existsSync(abs(client))) appendOnce(client,`try{if(typeof renderer!=='undefined')window.GoldenPerformanceAutoTune?.registerRenderer(renderer,{targetFps:matchMedia('(pointer:coarse)').matches?45:55,minDpr:.75,maxDpr:Math.min(devicePixelRatio||1,2)});}catch{}`,'GoldenPerformanceAutoTune?.registerRenderer',`${app} renderer autotune`);
}
// V10 mesh optimizer integration.
patch('services/ai3d-worker/ai3d/runner.py','from .plugins.gpu_router import RemoteGPU3DRouter','from .plugins.gpu_router import RemoteGPU3DRouter\\nfrom .plugins.mesh_quality_optimizer import MeshQualityOptimizer','import mesh optimizer');
patch('services/ai3d-worker/ai3d/runner.py','        self.gpu_router = RemoteGPU3DRouter()','        self.gpu_router = RemoteGPU3DRouter()\\n        self.mesh_optimizer = MeshQualityOptimizer()','init mesh optimizer');
patch('services/ai3d-worker/ai3d/runner.py','            validate_glb(glb_path)\\n            files.append(file_meta(glb_path, "model"))','            validate_glb(glb_path)\\n            _mesh_report, _lods = self.mesh_optimizer.prepare(glb_path, job_dir, params)\\n            files.append(file_meta(_mesh_report, "mesh_quality_report"))\\n            for _lod in _lods: files.append(file_meta(_lod, "mesh_lod"))\\n            files.append(file_meta(glb_path, "model"))','mesh quality and LOD postprocess');

// 6) package scripts
{
  const p=JSON.parse(read('package.json'));
  p.scripts=p.scripts||{};
  p.scripts['golden:check']='node scripts/check-golden-standard.js';
  p.scripts['golden:e2e']='playwright test e2e/golden-release.spec.js';
  p.scripts['quality:sync']='node scripts/quality-governance.js';
  p.scripts['quality:check']='node scripts/check-quality-governance.js';
  p.scripts['quality:regression']='node scripts/quality-regression-gate.js';
  p.scripts['quality:diff']='node scripts/quality-diff.js';
  p.scripts['quality:accept']='node scripts/quality-accept-baseline.js';
  p.scripts['release:gate']='npm run desktop-ai:check && npm run quality:cpu-policy && npm run quality:incremental-tests && npm run quality:invariants && npm run quality:hardware-profile && npm run check && npm run golden:check && npm run quality:check && npm run quality:regression && npm run quality:fuzz && npm run quality:impact && npm run quality:perceptual && npm run tech:audit && npm run tech:health && npm run quality:tech-orchestrator && npm run duplicates:check && npm run contracts:check && npm run project:review && npm run quality:stability && npm run evidence:score && npm run regressions:capture && npm run quality:issue-candidates && npm run desktop-ai:error-closure';
  p.scripts['duplicates:check']='node scripts/duplicate-system-review.js';
  p.scripts['contracts:check']='node scripts/system-contract-review.js';
  p.scripts['regressions:capture']='node scripts/capture-regressions.js';
  p.scripts['visual:check']='node scripts/visual-regression.js';
  p.scripts['tech:health']='node scripts/technology-runtime-health.js';
  p.scripts['evidence:score']='node scripts/evidence-quality-score.js';
  p.scripts['quality:growth']='node scripts/quality-growth-engine.js';
  p.scripts['quality:plan']='node scripts/quality-improvement-planner.js';
  p.scripts['quality:trend']='node scripts/quality-trend-monitor.js';
  p.scripts['quality:test-gaps']='node scripts/test-gap-synthesizer.js';
  p.scripts['quality:apps']='node scripts/app-quality-matrix.js';
  p.scripts['quality:promotion-candidate']='node scripts/quality-promotion-candidate.js';
  p.scripts['quality:auto-cycle']='node scripts/auto-quality-cycle.js';
  p.scripts['quality:autofix:plan']='node scripts/quality-autofix.js';
  p.scripts['quality:autofix']='node scripts/quality-autofix.js --apply';
  p.scripts['quality:assets']='node scripts/golden-asset-bot.js';
  p.scripts['quality:assets:apply']='node scripts/golden-asset-bot.js --apply';
  p.scripts['quality:real-devices']='node scripts/real-device-gate.js';
  p.scripts['quality:tech-orchestrator']='node scripts/technology-orchestrator.js';
  p.scripts['quality:stability']='node scripts/test-stability-runner.js';
  p.scripts['quality:issue-candidates']='node scripts/quality-issue-sync.js';
  p.scripts['visual:candidates']='playwright test e2e/visual-candidates.spec.js --project=desktop-chromium';
  p.scripts['quality:production']='node scripts/production-quality-pull.js';
  p.scripts['quality:fuzz']='node --test test/quality-fuzz.test.js';
  p.scripts['quality:impact']='node scripts/quality-impact-graph.js && node scripts/quality-changed-impact.js';
  p.scripts['quality:learn-fix']='node scripts/quality-learn-fix.js';
  p.scripts['quality:patch-synth']='node scripts/quality-patch-synthesizer.js';
  p.scripts['quality:perceptual']='node scripts/perceptual-visual-gate.js';
  p.scripts['quality:evolve']='node scripts/quality-self-evolve.js';
  p.scripts['quality:tournament']='node scripts/quality-patch-tournament.js';
  p.scripts['quality:root-cause']='node scripts/quality-root-cause.js';
  p.scripts['quality:generate-tests']='node scripts/generate-regression-tests.js';
  p.scripts['quality:risk']='node scripts/quality-risk-predictor.js';
  p.scripts['quality:cost']='node scripts/quality-cost-optimizer.js';
  p.scripts['quality:gpu-autoscale']='node scripts/gpu-autoscaler.js';
  p.scripts['quality:knowledge']='node scripts/quality-knowledge-graph.js';
  p.scripts['quality:visual-critic']='node scripts/ai-visual-critic.js';
  p.scripts['quality:experiment']='node scripts/quality-experiment-engine.js';
  p.scripts['quality:durable-cycle']='node scripts/durable-quality-cycle.js';
  p.scripts['quality:assets-dedup']='node scripts/asset-dedup-cache.js';
  p.scripts['desktop-ai:check']='node scripts/check-desktop-ai-protocol.js';
  p.scripts['desktop-ai:new-task']='node scripts/desktop-ai-new-task.js';
  p.scripts['quality:cpu-policy']='node scripts/check-cpu-only-autopilot.js';
  p.scripts['quality:cpu-learn']='node scripts/cpu-quality-learner.js';
  p.scripts['quality:autopilot-priority']='node scripts/autopilot-project-priority.js';
  p.scripts['quality:autopilot-plan']='node scripts/autopilot-task-planner.js';
  p.scripts['quality:cpu-budget']='node scripts/cpu-budget-gate.js';
  p.scripts['quality:cross-project-learn']='node scripts/cross-project-learning.js';
  p.scripts['quality:night-plan']='node scripts/cpu-nightly-planner.js';
  p.scripts['quality:night-report']='node scripts/cpu-nightly-report.js';
  p.scripts['desktop:cpu-night']='node desktop/cpu-night-autopilot.cjs';
  p.scripts['quality:cpu-genetic']='node scripts/cpu-genetic-optimizer.js';
  p.scripts['quality:incremental-tests']='node scripts/incremental-test-selector.js';
  p.scripts['quality:auto-test-synth']='node scripts/automatic-test-synthesizer.js';
  p.scripts['quality:cpu-model']='node scripts/local-cpu-code-model.js';
  p.scripts['quality:cpu-tournament']='node scripts/cpu-patch-tournament.js';
  p.scripts['quality:textures']='python scripts/cpu_texture_factory.py apps .quality-generated/textures';
  p.scripts['quality:mesh-scan']='node scripts/cpu-mesh-scan.js';
  p.scripts['quality:curriculum']='node scripts/project-quality-curriculum.js';
  p.scripts['quality:knowledge-learn']='node scripts/quality-knowledge-learning.js';
  p.scripts['quality:adaptive-budget']='node scripts/adaptive-night-budget.js';
  p.scripts['desktop-ai:error-closure']='node scripts/desktop-ai-error-closure.js';
  p.scripts['desktop-ai:fix-loop']='node scripts/desktop-ai-fix-loop.js';
  p.scripts['quality:visual-ensemble']='python scripts/cpu_visual_ensemble.py';
  p.scripts['quality:invariants']='node scripts/quality-invariant-miner.js';
  p.scripts['quality:test-cache-smoke']='node scripts/test-cache-smoke.js';
  p.scripts['quality:bayesian']='node scripts/bayesian-quality-predictor.js';
  p.scripts['quality:golden-pattern']='node scripts/promote-golden-pattern.js';
  p.scripts['quality:asset-similarity']='python scripts/asset_similarity_scan.py apps';
  p.scripts['quality:collision-simplify']='python scripts/cpu_collision_simplifier.py';
  p.scripts['quality:hardware-profile']='node scripts/hardware-fingerprint.js';
  p.scripts['quality:self-calibrate']='node scripts/quality-self-calibration.js';
  p.dependencies=p.dependencies||{};
  if(!p.dependencies['@vercel/sandbox']) p.dependencies['@vercel/sandbox']='^3.1.0';
  p.scripts['tech:audit']='node scripts/technology-audit.js';
  p.scripts['project:review']='node scripts/project-quality-reviewer.js';
  p.scripts['quality:master-report']='node scripts/quality-master-report.js';
  write('package.json',JSON.stringify(p,null,2)+'\n');
}


// 6b) Vercel production build hard gate: a source/quality regression must fail the deployment build.
{
  const p='vercel.json';
  if(!fs.existsSync(abs(p))) throw new Error('missing vercel.json');
  const v=JSON.parse(read(p));
  v.buildCommand='npm run release:gate';
  v.crons=Array.isArray(v.crons)?v.crons:[];
  const cpuCron={path:'/api/quality-autopilot-nightly',schedule:'17 23 * * *'};
  if(!v.crons.some(c=>c && c.path===cpuCron.path)){
    if(v.crons.length>=2) throw new Error('V11 CPU night cron not installed: vercel.json already has 2 cron jobs. Hobby plan supports max 2; consolidate manually.');
    v.crons.push(cpuCron);
  }
  write(p,JSON.stringify(v,null,2)+'\n');
}

// 7) CI hard gate. npx playwright test already runs every spec on both projects after config replacement.
{
  const p='.github/workflows/ci.yml';
  let s=read(p);
  const anchor='      - name: Install Playwright browsers\n';
  const block='      - name: WORLD SERVER Golden Standard source/release gate (hard)\n        run: npm run release:gate\n';
  if(!s.includes('Golden Standard source/release gate')){
    if(!s.includes(anchor)) throw new Error('CI anchor missing');
    s=s.replace(anchor,block+anchor);
    write(p,s);
  }
}

// 8) Permanent agent rule.
{
  const p='AGENTS.md';
  let s=read(p);
  if(!s.includes('## 10. WORLD SERVER GOLDEN STANDARD')){
    s += `

## 10. WORLD SERVER GOLDEN STANDARD — запрет сломанных релизов

- Публичная выдача игр работает по **deny-by-default**: приложение не появляется в \`/api/apps\` и каталоге, пока оно не имеет \`status: certified\` в \`data/app-release-registry.json\`.
- Финальную ссылку пользователю запрещено давать, пока не прошли \`npm run golden:check\` и Playwright на desktop + mobile.
- Минимальный контракт playable-мира: правильные camera-relative W/S/A/D и стрелки, mouse-look, touch movement/look, spawn на поверхности, grounding, wall collision, step-up по лестнице/ступени, отсутствие проваливания, непустой render.
- Запрещены self-reported ready-флаги как единственное доказательство. Нужен поведенческий тест.
- Любая найденная хорошая общая функция сначала переносится в Golden Component Registry, затем переиспользуется всеми совместимыми играми. Копии логики с разными знаками/формулами запрещены.
- Рабочая графика не удаляется и не упрощается ради прохождения тестов. Исправляется runtime/physics/input, а визуальный слой сохраняется.
- Diagnostic/tool/quarantine приложения не должны показываться в публичном игровом каталоге.
- Любая конструкция вида \`.toBeTruthy;\` / \`.toBeFalsy;\` без вызова считается ложным зелёным тестом и блокирует CI.
`;
    write(p,s);
  }
}

console.log('\nRunning hard source gate...');
cp.execFileSync(process.execPath,[abs('scripts/check-golden-standard.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/check-quality-governance.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/quality-regression-gate.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/quality-diff.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/technology-audit.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/project-quality-reviewer.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/duplicate-system-review.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/system-contract-review.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/technology-runtime-health.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/evidence-quality-score.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/capture-regressions.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/quality-master-report.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/quality-growth-engine.js')],{stdio:'inherit',cwd:ROOT});
cp.execFileSync(process.execPath,[abs('scripts/quality-improvement-planner.js')],{stdio:'inherit',cwd:ROOT});
console.log('\nGolden Standard installed. Backups:',backupRoot);
console.log('Next mandatory command before release: npx playwright install chromium && npx playwright test');


// V10.1: permanent Desktop AI work-instruction contract.
{
  const p='AGENTS.md';
  const marker='## 11. DESKTOP AI — mandatory work instruction';
  if(!read(p).includes(marker)){
    write(p,read(p)+`

## 11. DESKTOP AI — mandatory work instruction

For every task, patch, repair, upgrade, deployment or quality-improvement run:

- Read \`DESKTOP_AI_INSTALL_AND_VERIFY.md\` first.
- Create/update \`WORK_IN_PROGRESS.md\` before editing project files.
- The work MD must state: what we are doing, why, current state, target state, where the project is going, affected systems, risks, exact patch plan, required tests, what to do with the patch, current progress, next action, completion criteria and final evidence.
- A patch without an updated \`WORK_IN_PROGRESS.md\` is invalid.
- Do not declare completion while \`Final evidence\` is incomplete.
- Do not work directly on \`master\`.
- Do not merge/deploy if any accepted quality metric regresses.
- Confirmed fixes must become regression protection.
- Approved reusable successes must become exact Golden Components and be propagated to compatible projects.
`);
  }
}
