#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const esbuild=require('esbuild');

const root=path.resolve(__dirname,'..');
const entry=path.join(root,'apps','living-ink-office','webgl-entry.mjs');
const outDir=path.join(root,'apps','living-ink-office-v3');
const out=path.join(outDir,'index.html');

const result=esbuild.buildSync({
  entryPoints:[entry],
  bundle:true,
  format:'iife',
  platform:'browser',
  target:['es2020','safari15'],
  minify:true,
  treeShaking:true,
  write:false,
  legalComments:'none',
  banner:{js:'/*! three.js r160 / 0.160.0 - MIT - Copyright © 2010-2026 three.js authors. Full notice in THIRD_PARTY_NOTICES.txt and HTML source. */'}
});
const js=result.outputFiles[0].text.split('</script').join('<\\/script');
const notice=[
  'three.js r160 / 0.160.0',
  'MIT License — Copyright © 2010-2026 three.js authors.',
  'Permission is granted under the MIT License; full text is preserved in',
  'World Server THIRD_PARTY_NOTICES.txt and vendor/three-r160/LICENSE.'
].join('\\n');

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
'<!-- '+notice.replace(/--/g,'—')+' -->',
'<canvas id="living-ink"></canvas>',
'<div class="brand">ASQURA / REAL 3D NPR v3</div>',
'<div class="mode">DEPTH · HIDDEN-LINE · LOD · WATERCOLOUR</div>',
'<script>'+js+'</script>',
'</body></html>',
''
].join('\\n');

fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(out,html,'utf8');
console.log('Living Ink WebGL NPR v3 built: '+out+' ('+Buffer.byteLength(html)+' bytes)');
