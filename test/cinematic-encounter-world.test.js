'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('cinematic encounter ships the intended bounded VFX stack',()=>{
  const html=read('apps/cinematic-encounter/index.html');
  const js=read('apps/cinematic-encounter/client.js');
  for(const needle of ['EffectComposer','UnrealBloomPass','FogExp2','PointLight','flashCone','dustCount','sparkCount','camera.position']) assert.ok(js.includes(needle),`missing ${needle}`);
  assert.ok(js.includes('mobile?340:720'),'dust particle budget must be bounded by device class');
  assert.ok(js.includes('mobile?30:62'),'spark budget must be bounded by device class');
  assert.ok(html.includes('viewport-fit=cover'));
});

test('cinematic encounter preserves desktop and mobile playable controls',()=>{
  const html=read('apps/cinematic-encounter/index.html');
  const js=read('apps/cinematic-encounter/client.js');
  for(const key of ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) assert.ok(js.includes(key),`missing ${key}`);
  for(const id of ['movePad','moveKnob','lookPad','lookKnob']) assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
  assert.ok(js.includes("addEventListener('mousemove'"));
  assert.ok(js.includes("addEventListener('goldenlook'"));
  assert.ok(js.includes('colliders.some'));
  assert.ok(js.includes('groundHeightAt'));
});

test('cinematic encounter exposes render evidence and reusable feature contract',()=>{
  const js=read('apps/cinematic-encounter/client.js');
  assert.ok(js.includes('__CINEMATIC_ENCOUNTER_READY__'));
  for(const feature of ['procedural-silhouette','dust-fog','muzzle-flash','bloom','light-cone','camera-shake','adaptive-dpr','collision','step-up']) assert.ok(js.includes(`'${feature}'`),`missing feature ${feature}`);
  assert.ok(js.includes('renderer.info.render.calls'));
});
