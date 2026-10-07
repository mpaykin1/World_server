'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('watercolor primitives restore the canonical NPR building blocks',()=>{
  const p=path.join(__dirname,'..','shared','graphics','living-watercolor-primitives.mjs');
  const s=fs.readFileSync(p,'utf8');
  assert.match(s,/761f993e00d7b4d479756a3957f01ada928a6e7b/);
  for(const name of ['createWatercolorStyle','makePaperTexture','patchWatercolorMaterial','addInkShell','createPaperCompositor'])assert.match(s,new RegExp(name));
  assert.ok(s.split('\n').length<400);
});
