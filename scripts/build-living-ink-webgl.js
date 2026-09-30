#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const outDir=path.join(root,'apps','living-ink-office-v3');
const out=path.join(outDir,'index.html');

function read(rel){return fs.readFileSync(path.join(root,rel),'utf8');}
function dataUrl(source){return 'data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');}
function rewrite(source,map){
  let out=source;
  for(const [from,to] of Object.entries(map)) out=out.split(from).join(to);
  return out;
}

const three=read('vendor/three-r160/three.module.min.js');
const npr=rewrite(read('shared/living-ink-webgl-npr.mjs'),{
  "'../vendor/three-r160/three.module.min.js'":"'three'"
});
const human=rewrite(read('shared/living-ink-webgl-human.mjs'),{
  "'../vendor/three-r160/three.module.min.js'":"'three'",
  "'./living-ink-webgl-npr.mjs'":"'@living/npr'"
});
const scene=rewrite(read('shared/living-ink-webgl-scene.mjs'),{
  "'../vendor/three-r160/three.module.min.js'":"'three'",
  "'./living-ink-webgl-npr.mjs'":"'@living/npr'",
  "'./living-ink-webgl-human.mjs'":"'@living/human'"
});
const entry=rewrite(read('apps/living-ink-office/webgl-entry.mjs'),{
  "'../../vendor/three-r160/three.module.min.js'":"'three'",
  "'../../shared/living-ink-webgl-npr.mjs'":"'@living/npr'",
  "'../../shared/living-ink-webgl-scene.mjs'":"'@living/scene'"
});

const importMap={
  imports:{
    three:dataUrl(three),
    '@living/npr':dataUrl(npr),
    '@living/human':dataUrl(human),
    '@living/scene':dataUrl(scene),
    '@living/entry':dataUrl(entry)
  }
};
const notice=[
  'three.js r160 / 0.160.0',
  'MIT License — Copyright © 2010-2023 three.js authors.',
  'Full license text: World Server THIRD_PARTY_NOTICES.txt and vendor/three-r160/LICENSE.'
].join(' ');

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
'<script type="importmap">'+JSON.stringify(importMap).replace(/<\/script/gi,'<\\/script')+'</script>',
'</head><body>',
'<!-- '+notice+' -->',
'<canvas id="living-ink"></canvas>',
'<div class="brand">ASQURA / REAL 3D NPR v3</div>',
'<div class="mode">DEPTH · HIDDEN-LINE · LOD · WATERCOLOUR</div>',
'<script type="module">import "@living/entry";</script>',
'</body></html>',
''
].join('\n');

fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(out,html,'utf8');
console.log('Living Ink WebGL NPR v3 built: '+out+' ('+Buffer.byteLength(html)+' bytes)');
