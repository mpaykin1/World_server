'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rigs=require('../shared/rig-adapters.js');

function tree(names){
  const nodes=names.map(name=>({name}));
  return {name:'Hero',traverse(fn){fn(this);for(const n of nodes)fn(n)}};
}

test('discovers common semantic rig nodes without changing graphics',()=>{
  const r=rigs.discoverThree(tree(['LeftFoot','RightFoot','LeftHand','RightHand','UpperTorso','Shield','Rifle']));
  assert.equal(r.coverage,1);
  assert.ok(r.map.shield);
  assert.ok(r.map.rifle);
});

test('scene scan marks weapon/limb rig as relevant',()=>{
  const r=rigs.scanScene(tree(['L_Foot','R_Foot','Pistol']));
  assert.equal(r.relevant,true);
});
