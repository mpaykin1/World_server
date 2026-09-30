'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('path');
const fs=require('fs');
const {ROOT,MARKER,injectHtml,indexFiles,shouldInjectPath,EXEMPT_APPS}=require('../scripts/inject-game-viewport-lock');

test('viewport lock injection is idempotent',()=>{
  const source='<!doctype html><html><head><title>x</title></head><body><canvas></canvas></body></html>';
  const once=injectHtml(source);
  const twice=injectHtml(once);
  assert.equal(once,twice);
  assert.equal((once.match(new RegExp(MARKER,'g'))||[]).length,2);
});

test('all game app entrypoints are protected by default except explicit tools',()=>{
  const files=indexFiles();
  assert.ok(files.length>=10);
  for(const file of files){
    const app=path.basename(path.dirname(file));
    assert.equal(shouldInjectPath(file),!EXEMPT_APPS.has(app),app);
  }
});

test('runtime encodes the full viewport ownership chain',()=>{
  const runtime=fs.readFileSync(path.join(ROOT,'shared/world-server-game-viewport.js'),'utf8');
  for(const token of ['visualViewport','setPointerCapture','devicePixelRatio','drawingBufferWidth','updateProjectionMatrix','renderTargets','worldserverviewportresize']){
    assert.ok(runtime.includes(token),token);
  }
});
