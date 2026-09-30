#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'apps','living-ink-office-v3');
const out=path.join(outDir,'index.html');
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8');}
function safeJson(value){return JSON.stringify(value).replace(/</g,'\\u003c');}

const sources={
  three:read('vendor/three-r160/three.module.min.js'),
  npr:read('shared/living-ink-webgl-npr.mjs')
    .split("'../vendor/three-r160/three.module.min.js'").join("'__THREE__'"),
  human:read('shared/living-ink-webgl-human.mjs')
    .split("'../vendor/three-r160/three.module.min.js'").join("'__THREE__'")
    .split("'./living-ink-webgl-npr.mjs'").join("'__NPR__'"),
  scene:read('shared/living-ink-webgl-scene.mjs')
    .split("'../vendor/three-r160/three.module.min.js'").join("'__THREE__'")
    .split("'./living-ink-webgl-npr.mjs'").join("'__NPR__'")
    .split("'./living-ink-webgl-human.mjs'").join("'__HUMAN__'"),
  entry:read('apps/living-ink-office/webgl-entry.mjs')
    .split("'../../vendor/three-r160/three.module.min.js'").join("'__THREE__'")
    .split("'../../shared/living-ink-webgl-npr.mjs'").join("'__NPR__'")
    .split("'../../shared/living-ink-webgl-scene.mjs'").join("'__SCENE__'")
};
const loader=[
  'const make=s=>URL.createObjectURL(new Blob([s],{type:"text/javascript"}));',
  'const three=make('+safeJson(sources.three)+');',
  'const npr=make(('+safeJson(sources.npr)+').split("__THREE__").join(three));',
  'const human=make(('+safeJson(sources.human)+').split("__THREE__").join(three).split("__NPR__").join(npr));',
  'const scene=make(('+safeJson(sources.scene)+').split("__THREE__").join(three).split("__NPR__").join(npr).split("__HUMAN__").join(human));',
  'const entry=make(('+safeJson(sources.entry)+').split("__THREE__").join(three).split("__NPR__").join(npr).split("__SCENE__").join(scene));',
  'await import(entry);'
].join('\n');

const notice='three.js r160 / 0.160.0 — MIT License — Copyright © 2010-2023 three.js authors. Full text in THIRD_PARTY_NOTICES.txt and vendor/three-r160/LICENSE.';
const html=[
'<!doctype html>',
'<html lang="en"><head>',
'<meta charset="utf-8">',
'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">',
'<meta name="theme-color" content="#f8f4ed">',
'<link rel="icon" href="data:,">',
'<title>ASQURA Living Ink NPR v3</title>',
'<style>',
'html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f8f4ed;overscroll-behavior:none}',
'body{position:fixed;inset:0;touch-action:none;font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
'canvas{display:block;width:100vw;height:100vh;touch-action:none}',
'.brand{position:fixed;right:16px;top:max(14px,env(safe-area-inset-top));z-index:9;color:rgba(67,86,106,.26);font:800 11px system-ui;letter-spacing:.14em;pointer-events:none}',
'.mode{position:fixed;right:16px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9;color:rgba(67,86,106,.18);font:700 9px system-ui;letter-spacing:.10em;pointer-events:none}',
'</style>',
'</head><body>',
'<!-- '+notice+' -->',
'<canvas id="living-ink"></canvas>',
'<div class="brand">ASQURA / REAL 3D NPR v3</div>',
'<div class="mode">DEPTH · HIDDEN-LINE · LOD · WATERCOLOUR</div>',
'<script type="module">'+loader.replace(/<\/script/gi,'<\\/script')+'</script>',
'</body></html>',
''
].join('\n');
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(out,html,'utf8');
console.log('Living Ink WebGL NPR v3 built: '+out+' ('+Buffer.byteLength(html)+' bytes)');
