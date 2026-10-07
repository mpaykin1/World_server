'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('watercolor semantic generators and reference gate are importable',async()=>{
  const root=path.join(__dirname,'..','shared','graphics');
  const g=await import(pathToFileURL(path.join(root,'living-watercolor-generators.mjs')).href);
  const q=await import(pathToFileURL(path.join(root,'living-watercolor-reference-gate.mjs')).href);
  for(const name of ['createWatercolorHouse','createWatercolorTree','createWatercolorVolcano','createWatercolorPlant'])assert.equal(typeof g[name],'function');
  assert.equal(typeof q.scoreWatercolorMetrics,'function');
  const perfect=q.scoreWatercolorMetrics(q.WATERCOLOUR_REFERENCE_PROFILES.house,'house');
  assert.equal(perfect.pass,true);assert.equal(perfect.score,100);
});
