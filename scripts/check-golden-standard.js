'use strict';
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fail=m=>{console.error('GOLDEN STANDARD FAIL:',m);process.exitCode=1;};
const ok=m=>console.log('GOLDEN STANDARD OK:',m);

const registry=JSON.parse(read('data/app-release-registry.json'));
if(registry.policy!=='deny-by-default') fail('release registry must be deny-by-default');
else ok('deny-by-default release registry');

const appDirs=fs.readdirSync(path.join(root,'apps'),{withFileTypes:true})
  .filter(e=>e.isDirectory() && fs.existsSync(path.join(root,'apps',e.name,'index.html')))
  .map(e=>e.name);
for(const id of appDirs) if(!registry.apps[id]) fail(`unregistered app: ${id}`);
for(const [id,m] of Object.entries(registry.apps)){
  if(m.visible && m.status!=='certified') fail(`visible app is not certified: ${id}`);
}
ok('all apps registered; public catalog only certified');

const apiApps=read('api/apps.js');
if(!apiApps.includes("policy !== 'deny-by-default'") || !apiApps.includes("meta.status === 'certified'"))
  fail('/api/apps is not gated by certified registry');
else ok('/api/apps certification gate');

const runtime=read('shared/ai3d-playable-runtime.js');
for(const needle of ['TOUCH_JOYSTICK','basisFromForward','goldenlook','mobileReady']){
  if(!runtime.includes(needle)) fail(`runtime missing ${needle}`);
}
if(!runtime.includes("right:{ x:-fz, z:fx }")) fail('canonical screen-right basis missing');
else ok('canonical input + mobile runtime');

const voxel=read('apps/voxel-world/client.js');
if(voxel.includes("+(f/len)*sy") || voxel.includes("(f/len)*sy)*speed, vz=((s/len)*sy-(f/len)*cy"))
  fail('voxel-world contains known inverted camera-relative movement');
if(!voxel.includes('GOLDEN_STEP_HEIGHTS')) fail('voxel-world step-up missing');
else ok('voxel-world direction + step-up');

const ai3d=read('apps/ai3d-voxel-city/client.js');
if(ai3d.includes('const wishX = (s*cos + f*sin)')) fail('ai3d contains known inverted forward formula');
if(!ai3d.includes('GOLDEN_STEP_HEIGHTS')) fail('ai3d step-up missing');
if(!ai3d.includes("addEventListener('goldenlook'")) fail('ai3d touch-look bridge missing');
else ok('ai3d direction + step-up + touch-look');

const catalog=read('apps/catalog/client.js');
if(catalog.includes('const right = new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));'))
  fail('catalog A/D remains reversed relative to camera');
if(!catalog.includes("addEventListener('goldenlook'")) fail('catalog touch-look bridge missing');
else ok('catalog directions + touch-look');

const catHtml=read('apps/catalog/index.html');
if(!catHtml.includes('/shared/golden-catalog-menu.js')) fail('catalog direct world menu missing');
if(!catHtml.includes('/shared/ai3d-playable-runtime.js')) fail('catalog golden runtime missing');

const pw=read('playwright.config.js');
if(!pw.includes("Mobile Chrome") && !pw.includes("Pixel 7")) fail('Playwright mobile project missing');
else ok('desktop + mobile browser matrix');

const e2eDir=path.join(root,'e2e');
for(const f of fs.readdirSync(e2eDir).filter(x=>x.endsWith('.spec.js'))){
  const s=fs.readFileSync(path.join(e2eDir,f),'utf8');
  if(/\.toBeTruthy\s*;/.test(s)) fail(`false-green assertion in ${f}: toBeTruthy missing ()`);
  if(/\.toBeFalsy\s*;/.test(s)) fail(`false-green assertion in ${f}: toBeFalsy missing ()`);
}
ok('no known false-green assertions');


const uiPolicy=JSON.parse(read('data/ui-policy.json'));
const controlPolicy=JSON.parse(read('data/control-policy.json'));
const shellJs=read('shared/golden-ui-shell.js'),shellCss=read('shared/golden-ui-shell.css'),voxelHtml=read('apps/voxel-world/index.html');
const topTabs=[...shellJs.matchAll(/data-golden-tab=\"([^\"]+)\"/g)].map(m=>m[1]);
if(JSON.stringify(topTabs)!==JSON.stringify(['menu','worlds','settings','info'])) fail('Golden top toolbar must contain exactly menu/worlds/settings/info');
if(JSON.stringify(uiPolicy.rules.goldenTopToolbar)!==JSON.stringify(['menu','worlds','settings','info'])) fail('UI policy lost four-button top toolbar');
if(!shellCss.includes('#goldenDrawerClose{width:46px')||!shellCss.includes('width:52px;height:52px')) fail('mobile drawer close target is below Golden size');
if(!shellCss.includes('.golden-drawer-open #mobileControls')) fail('modal does not disable gameplay touch controls');
if(!voxelHtml.includes('id=\"movePad\"')||!voxelHtml.includes('id=\"lookPad\"')) fail('Voxel World must expose two visible mobile joysticks');
if(!voxel.includes('mobileLook')||!voxel.includes("addEventListener('goldendrawerchange'")) fail('Voxel World visible look joystick / modal reset missing');
if(JSON.stringify(controlPolicy.mobile)!==JSON.stringify(['VISIBLE_LEFT_MOVE_JOYSTICK','VISIBLE_RIGHT_LOOK_JOYSTICK','TOUCH_JUMP'])) fail('control policy no longer requires visible dual joysticks');
const requiredWorldUrls=['https://dark-void-navigator.vercel.app/','https://improve-world-home-improve-world.vercel.app/','https://improve-world-experiment-100-improve-world.vercel.app/','https://voxel-gothic-steampunk-world-improve-world.vercel.app/','https://gothic-voxel-city-atlas-v3-mobile-final-improve-world.vercel.app/','https://voxel-gothic-steampunk-mobile-repaired-improve-world.vercel.app/','https://world-server-git-codex-voxel-v3-improve-world.vercel.app/apps/voxel-world/','https://world-server.vercel.app/apps/catalog/'];
const externalUrls=new Set((registry.externalWorlds||[]).map(x=>x.url));
for(const url of requiredWorldUrls) if(!externalUrls.has(url)) fail('World newspaper lost required URL: '+url);
for(const item of registry.externalWorlds||[]){const m=item.worldMenu;if(!m?.headline||!m?.lore||!m?.history)fail('world lore missing: '+item.id);const f=path.join(root,m?.previewVideo?.replace(/^\//,'')||'');if(!fs.existsSync(f)||fs.statSync(f).size<=0||fs.statSync(f).size>uiPolicy.rules.worldPreviewMaxBytes)fail('ultra-light preview invalid: '+item.id);}
if(!shellJs.includes('data-world-view=\"newspaper\"')||!shellJs.includes('data-world-view=\"connections\"')) fail('newspaper/connections menu missing');
if(!shellJs.includes('id=\"goldenLore\"')||!shellJs.includes('goldenLoreHistory')) fail('simple world lore panel missing');
if(JSON.stringify(registry).includes('???')) fail('world registry contains encoding corruption');
else ok('Golden top bar + dual joysticks + newspaper/lore/connections contract');

if(process.exitCode) process.exit(process.exitCode);
console.log('GOLDEN STANDARD: PASS');

for(const required of ['shared/golden-ui-shell.js','shared/golden-ui-shell.css','shared/golden-physics.js','data/ui-policy.json','data/visual-quality-policy.json','data/control-policy.json','data/collision-policy.json']){
  if(!fs.existsSync(path.join(root,required))) fail(`missing shared standard: ${required}`);
}
for(const id of ['voxel-world','ai3d-voxel-city']){
  const html=read(`apps/${id}/index.html`);
  if(!html.includes('/shared/golden-ui-shell.js')) fail(`${id}: Golden UI shell missing`);
  if(!html.includes('/shared/golden-physics.js')) fail(`${id}: shared physics missing`);
}
ok('shared UI + physics propagation');
