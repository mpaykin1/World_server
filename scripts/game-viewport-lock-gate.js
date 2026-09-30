#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {ROOT,injectHtml,indexFiles,shouldInjectPath}=require('./inject-game-viewport-lock');

let bad=false;
function fail(message){ bad=true; console.error('[GAME_VIEWPORT_LOCK_GATE]',message); }
function read(rel){ return fs.readFileSync(path.join(ROOT,rel),'utf8'); }

const required=[
  'shared/world-server-game-viewport.js',
  'shared/world-server-game-viewport.css',
  'scripts/inject-game-viewport-lock.js',
  'e2e/game-viewport-lock.spec.js',
  'test/game-viewport-lock.test.js',
  'docs/GAME_VIEWPORT_LOCK.md'
];
for(const rel of required) if(!fs.existsSync(path.join(ROOT,rel))) fail('missing '+rel);

if(!bad){
  const runtime=read('shared/world-server-game-viewport.js');
  const css=read('shared/world-server-game-viewport.css');
  const contracts=[
    [runtime,/visualViewport/,'VisualViewport ownership'],
    [runtime,/setPointerCapture/,'pointer capture'],
    [runtime,/drawingBufferWidth/,'drawing-buffer QA'],
    [runtime,/webglViewport/,'WebGL viewport QA'],
    [runtime,/cameraAspect/,'camera aspect QA'],
    [runtime,/scrollTo\(0,0\)/,'scroll reset'],
    [css,/overscroll-behavior:none/,'overscroll lock'],
    [css,/touch-action:none/,'touch ownership'],
    [css,/position:fixed/,'fixed document/root']
  ];
  for(const [source,re,label] of contracts) if(!re.test(source)) fail('missing contract: '+label);

  for(const file of indexFiles()){
    if(!shouldInjectPath(file)) continue;
    const injected=injectHtml(fs.readFileSync(file,'utf8'));
    const count=(injected.match(/data-world-server-viewport-lock="1"/g)||[]).length;
    if(count!==2) fail(path.relative(ROOT,file)+' is not safely injectable exactly once');
  }

  const vercel=JSON.parse(read('vercel.json'));
  if(!String(vercel.buildCommand||'').includes('inject-game-viewport-lock.js')) fail('Vercel build does not inject viewport lock');
  const wrangler=JSON.parse(read('wrangler.jsonc'));
  if(!String(wrangler.build?.command||'').includes('inject-game-viewport-lock.js')) fail('Cloudflare build does not inject viewport lock');
  const pkg=JSON.parse(read('package.json'));
  if(!String(pkg.scripts?.['release:gate']||'').includes('viewport:check')) fail('release:gate does not enforce viewport:check');
  if(!String(pkg.scripts?.build||'').includes('viewport:inject')) fail('build does not inject viewport lock');
}
if(bad) process.exit(23);
console.log('[GAME_VIEWPORT_LOCK_GATE] PASS');
