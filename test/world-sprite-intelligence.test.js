'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {planWorldSprites}=require('../lib/world-sprite-needs');
const {generate}=require('../scripts/world-sprite-cpu');
const cases=[
  {entities:['city','forest'],id:'frontier-smoke',zone:'lumberyard'},
  {entities:['forest','river'],id:'river-ripple',zone:'wetland'},
  {entities:['forest','volcano'],id:'volcanic-ash',zone:'ash_field'}
];
for(const scenario of cases){
  test('CPU atlas and causal need: '+scenario.id,()=>{
    const plan=planWorldSprites({entities:scenario.entities,zones:[scenario.zone]},[],{maxSprites:1});
    assert.equal(plan.candidates.length,1);assert.equal(plan.candidates[0].id,scenario.id);
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ws-sprite-'));
    try{
      const result=generate({entities:scenario.entities,zones:[scenario.zone]},dir);
      assert.equal(result.assets.length,1);
      const asset=result.assets[0],bytes=fs.readFileSync(path.join(dir,asset.file));
      assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16),64);assert.equal(bytes.readUInt32BE(20),16);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),asset.sha256);
      assert.equal(asset.frames,4);assert.equal(asset.alpha,true);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).assets,result.assets);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  });
}
test('reject wrong biome and wrong relation',()=>{
  assert.equal(planWorldSprites({entities:['forest','river'],biome:'desert'}).candidates.length,0);
  assert.equal(planWorldSprites({entities:['city','volcano']}).candidates.length,0);
});
test('reuse inventory, reject exhausted budget',()=>{
  const world={entities:['forest','river']};
  assert.equal(planWorldSprites(world,['river-ripple']).candidates[0].action,'reuse');
  assert.equal(planWorldSprites(world,[],{maxSprites:0}).candidates.length,0);
  assert.equal(planWorldSprites(world,[],{maxSprites:0}).rejected.length,1);
});
