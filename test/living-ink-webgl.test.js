'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.resolve(__dirname,'..');

test('three.js r160 is audited and vendored',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'third-party-manifest.json'),'utf8'));
  const three=manifest.dependencies.find(x=>x.name==='three');
  assert.ok(three);
  assert.equal(three.license,'MIT');
  assert.equal(three.commitOrTag,'r160');
  assert.match(three.sha256,/^[0-9a-f]{64}$/);
  assert.ok(fs.existsSync(path.join(root,'vendor','three-r160','three.module.min.js')));
  assert.ok(fs.existsSync(path.join(root,'vendor','three-r160','LICENSE')));
});

test('WebGL NPR source exposes the required real-3D systems',()=>{
  const npr=fs.readFileSync(path.join(root,'shared','living-ink-webgl-npr.mjs'),'utf8');
  const humans=fs.readFileSync(path.join(root,'shared','living-ink-webgl-human.mjs'),'utf8');
  const scene=fs.readFileSync(path.join(root,'shared','living-ink-webgl-scene.mjs'),'utf8');
  const entry=fs.readFileSync(path.join(root,'apps','living-ink-office','webgl-entry.mjs'),'utf8');
  assert.match(npr,/WebGLRenderer/);
  assert.match(npr,/EdgesGeometry/);
  assert.match(npr,/depthTest:true/);
  assert.match(humans,/createOfficeHuman/);
  assert.match(scene,/glassRoom/);
  assert.match(scene,/coffeePoint/);
  assert.match(entry,/depth-buffer-hidden-line/);
  assert.match(entry,/architectural-camera-director/);
  assert.match(entry,/artistic-lod-3/);
});

test('standalone WebGL NPR artifact builds without external runtime dependencies',()=>{
  cp.execFileSync(process.execPath,[path.join(root,'scripts','build-living-ink-webgl.js')],{cwd:root,stdio:'pipe'});
  const html=fs.readFileSync(path.join(root,'apps','living-ink-office-v3','index.html'),'utf8');
  assert.match(html,/ASQURA \/ REAL 3D NPR v3/);
  assert.match(html,/three-webgl-npr-v3/);
  assert.match(html,/Copyright © 2010-2023 three\.js authors/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);
  assert.doesNotMatch(html,/<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html,/<img[^>]+src=["']https?:/i);
});

test('new Living Ink WebGL modules stay below architecture line limit',()=>{
  const files=[
    'shared/living-ink-webgl-npr.mjs',
    'shared/living-ink-webgl-human.mjs',
    'shared/living-ink-webgl-scene.mjs',
    'apps/living-ink-office/webgl-entry.mjs'
  ];
  for(const file of files){
    const lines=fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/).length;
    assert.ok(lines<=400,file+': '+lines+' lines exceeds 400');
  }
});
