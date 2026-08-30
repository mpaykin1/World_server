#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=process.cwd();
let failed=0;
const ok=m=>console.log('MOBILE UI OK:',m);
const fail=m=>{failed++;console.error('MOBILE UI FAIL:',m);};
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));

for(const rel of [
  'shared/ai3d-playable-runtime.js',
  'shared/mobile-game-shell.js',
  'shared/mobile-game-shell.css',
  'data/mobile-playable-ui-policy-v3.json',
  'data/mobile-playable-ui-known-failures-v3.json'
]) exists(rel)?ok(rel):fail(`missing ${rel}`);

if(exists('shared/ai3d-playable-runtime.js')){
  const s=read('shared/ai3d-playable-runtime.js');
  for(const needle of ['WORLD_SERVER_GOLDEN_STANDARD_V2','GOLDEN_MOBILE_INPUT_HARDENING_V3','any-pointer:coarse','goldenMovePad','goldenLookZone'])
    s.includes(needle)?ok(`runtime contains ${needle}`):fail(`runtime missing ${needle}`);
  if(/getElementById\(['"]mobileControls['"]\)\s*\|\|\s*document\.getElementById\(['"]goldenMobileControls/.test(s))
    fail('runtime still has foreign #mobileControls false-ready shortcut');
}
if(exists('shared/mobile-game-shell.js')){
  const s=read('shared/mobile-game-shell.js');
  for(const needle of ['MutationObserver','visualViewport','GoldenUIShell','requestFullscreenBestEffort','validateGoldenControls'])
    s.includes(needle)?ok(`shell contains ${needle}`):fail(`shell missing ${needle}`);
  if(/querySelectorAll\(['"]img,canvas/.test(s)) fail('shell may auto-scale canvas as eye');
}
if(exists('shared/mobile-game-shell.css')){
  const s=read('shared/mobile-game-shell.css');
  for(const needle of ['safe-area-inset-bottom','--mgs-keyboard-inset','data-mobile-orientation="portrait"','content:none'])
    s.includes(needle)?ok(`css contains ${needle}`):fail(`css missing ${needle}`);
}
if(exists('data/ui-policy.json')){
  const d=JSON.parse(read('data/ui-policy.json'));
  if(d.rules?.desktopNoChangeForMobileShell===true) ok('desktop no-change policy'); else fail('desktop no-change policy missing');
  if(d.rules?.mobileFullscreenButton===true) ok('mobile fullscreen policy'); else fail('mobile fullscreen policy missing');
}
if(exists('data/golden-components.json')){
  const d=JSON.parse(read('data/golden-components.json'));
  const m=d.components?.['mobile-game-shell'];
  if(m?.canonical==='shared/mobile-game-shell.js') ok('mobile shell registered as canonical candidate'); else fail('mobile shell canonical registration missing');
}
if(failed){console.error(`MOBILE PLAYABLE UI STANDARD: FAIL (${failed})`);process.exit(1)}
console.log('MOBILE PLAYABLE UI STANDARD: PASS');
