'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const Core=require('../shared/living-ink-core');
const Office=require('../shared/living-ink-office');
const Compiler=require('../lib/living-ink-compiler');
const recipe=require('../data/living-ink-office.recipe.json');
test('seeded artistic variation is deterministic',()=>{
  assert.equal(Core.hash(12345,1,2,3),Core.hash(12345,1,2,3));
  assert.notEqual(Core.hash(12345,1,2,3),Core.hash(12346,1,2,3));
});
test('artistic LOD reduces information with distance',()=>{
  assert.equal(Core.selectArtisticLod(5),0);assert.equal(Core.selectArtisticLod(15),1);assert.equal(Core.selectArtisticLod(30),2);
});
test('procedural employees are visibly distinct and office-capable',()=>{
  const people=[0,1,2].map(i=>Office.personProfile(recipe.seed,i));
  assert.equal(new Set(people.map(p=>p.id)).size,3);
  assert.ok(new Set(people.map(p=>`${p.height.toFixed(3)}:${p.build.toFixed(3)}:${p.suit}:${p.accessory}`)).size>=3);
  for(const action of ['walk','sit','type','coffee'])assert.ok(Office.ACTIONS.includes(action));
});
test('WorldRecipe contains first vertical-slice contract',()=>{
  Compiler.validateWorldRecipe(recipe);assert.equal(recipe.layout.rooms,1);assert.equal(recipe.layout.desks,2);assert.equal(recipe.characters.length,3);assert.ok(recipe.lod.artisticLevels>=2);
});
test('compiled artifact is autonomous and has no runtime network reference',()=>{
  const core=fs.readFileSync(path.join(root,'shared','living-ink-core.js'),'utf8');
  const office=fs.readFileSync(path.join(root,'shared','living-ink-office.js'),'utf8');
  const html=Compiler.compileStandalone({recipe,coreSource:core,officeSource:office});
  assert.match(html,/__LIVING_INK_STANDALONE__/);assert.match(html,/ASQURA/);
  assert.doesNotMatch(html,/<script[^>]+src=/i);assert.doesNotMatch(html,/<link[^>]+href=/i);
  assert.doesNotMatch(html,/\bhttps?:\/\//i);assert.doesNotMatch(html,/fetch\s*\(/);assert.doesNotMatch(html,/XMLHttpRequest|WebSocket/);
});
test('generated standalone matches compiler output exactly',()=>{
  const core=fs.readFileSync(path.join(root,'shared','living-ink-core.js'),'utf8');
  const office=fs.readFileSync(path.join(root,'shared','living-ink-office.js'),'utf8');
  const expected=Compiler.compileStandalone({recipe,coreSource:core,officeSource:office});
  const actual=fs.readFileSync(path.join(root,'apps','living-ink-office','index.html'),'utf8').replace(/\s*<script src="\/shared\/sentry-runtime\.js"><\/script>\s*/g,'');assert.equal(actual.replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'));
});
