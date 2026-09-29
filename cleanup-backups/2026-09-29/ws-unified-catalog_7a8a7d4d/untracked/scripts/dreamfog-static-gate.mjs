import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();
const must=[
  'apps/dreamfog-world/index.html','apps/dreamfog-world/client.js','apps/dreamfog-world/style.css','apps/dreamfog-world/scene-delivery.json',
  'shared/dreamfog-atmosphere.js','shared/ai3d-playable-runtime.js','shared/golden-physics.js','shared/golden-performance-autotuner.js',
  'services/ai3d-worker/ai3d/plugins/depth_anything.py','services/ai3d-worker/tools/dreamfog_from_image.py','data/dreamfog-quality-profile.json'
];
const fail=[];for(const f of must)if(!fs.existsSync(path.join(root,f)))fail.push(`missing ${f}`);
const client=fs.existsSync(path.join(root,'apps/dreamfog-world/client.js'))?fs.readFileSync(path.join(root,'apps/dreamfog-world/client.js'),'utf8'):'';
const html=fs.existsSync(path.join(root,'apps/dreamfog-world/index.html'))?fs.readFileSync(path.join(root,'apps/dreamfog-world/index.html'),'utf8'):'';
const atm=fs.existsSync(path.join(root,'shared/dreamfog-atmosphere.js'))?fs.readFileSync(path.join(root,'shared/dreamfog-atmosphere.js'),'utf8'):'';
for(const token of ['/shared/ai3d-playable-runtime.js','/shared/golden-physics.js','/shared/golden-performance-autotuner.js'])if(!html.includes(token))fail.push(`DreamFog must reuse ${token}`);
if(!client.includes('GameGoldenPhysics'))fail.push('client must reuse GameGoldenPhysics');
if(!client.includes('GoldenPerformanceAutoTune'))fail.push('client must reuse GoldenPerformanceAutoTune');
for(const token of ['FogExp2','InstancedMesh','DreamFogPostFX','goldenperformance','enableAudio','colliders'])if(!atm.includes(token))fail.push(`atmosphere missing capability ${token}`);
if(/class\s+GoldenPerformance|function\s+moveSwept/.test(atm))fail.push('duplicate golden subsystem detected');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));for(const s of ['dreamfog:static','dreamfog:e2e','dreamfog:test','dreamfog:from-image'])if(!pkg.scripts?.[s])fail.push(`package script missing ${s}`);
const registry=JSON.parse(fs.readFileSync(path.join(root,'data/app-release-registry.json'),'utf8'));const app=registry.apps?.['dreamfog-world'];if(!app)fail.push('release registry entry missing dreamfog-world');
if(app?.status==='certified'&&app?.visible===true){const reportPath=path.join(root,'DREAMFOG_VERIFICATION_REPORT.json');if(!fs.existsSync(reportPath))fail.push('DreamFog cannot be certified without verification report');else{const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));if(report.passed!==true||report.full!==true)fail.push('DreamFog certification requires passed full verification');}}
if(fail.length){console.error('DREAMFOG_STATIC_GATE FAIL\n- '+fail.join('\n- '));process.exit(1);}console.log('DREAMFOG_STATIC_GATE PASS');
