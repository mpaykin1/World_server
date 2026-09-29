#!/usr/bin/env node
'use strict';
const urls=[
 ['google-fonts','https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/OFL.txt'],
 ['opentype-unpkg','https://unpkg.com/opentype.js@2.0.0/package.json'],
 ['hanzi-data-jsdelivr','https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/package.json'],
 ['npm-registry-opentype','https://registry.npmjs.org/opentype.js/2.0.0'],
 ['npm-registry-gltfpack','https://registry.npmjs.org/gltfpack/1.2.0']
];
(async()=>{let pass=0;for(const [name,url] of urls){try{const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);const r=await fetch(url,{method:'GET',signal:ac.signal,headers:{'user-agent':'WorldServer-InkGlyphWorld/3.0'}});clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status}`);await r.arrayBuffer();console.log(`PASS ${name}`);pass++}catch(e){console.warn(`WARN ${name}: ${e.message}`)}}console.log(`INK_GLYPH_NETWORK ${pass}/${urls.length} reachable`);process.exit(pass?0:2)})()
