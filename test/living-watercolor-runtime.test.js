'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('watercolor runtime facade is importable and exposes canonical API',async()=>{
  const mod=await import(pathToFileURL(path.join(__dirname,'..','shared','graphics','living-watercolor-3d.mjs')).href);
  assert.equal(typeof mod.createLivingWatercolor3D,'function');
  assert.equal(typeof mod.createWatercolorStyle,'function');
  assert.equal(typeof mod.stableSeed,'function');
  const style=mod.createWatercolorStyle({washOpacity:.5});
  assert.equal(style.washOpacity,.5);
  assert.ok(style.lod.near<style.lod.far);
});
