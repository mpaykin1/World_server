'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const sim=require('../lib/interplanetary-simulation');

test('same species inputs produce same adaptation',()=>{
  const planet=sim.createPlanet({worldId:'root',planetId:'p2',seed:'case-17',gravity:1.6});
  assert.deepEqual(
    sim.adaptSpecies({speciesId:'mossfolk',genomeSeed:'g-4',planet}),
    sim.adaptSpecies({speciesId:'mossfolk',genomeSeed:'g-4',planet})
  );
});

test('nested worlds have a fixed maximum depth',()=>{
  let parent={worldId:'root',depth:0,childWorldIds:[]};
  for(let i=1;i<=sim.MAX_NESTING_DEPTH;i++) parent=sim.createNestedWorld({parent,worldId:`w${i}`});
  assert.throws(()=>sim.createNestedWorld({parent,worldId:'extra'}),/depth/);
});

test('nested worlds enforce compute budget',()=>{
  assert.throws(()=>sim.createNestedWorld({parent:{worldId:'root',depth:0,childWorldIds:[]},worldId:'large',cpuUnits:1001}),/cpuUnits/);
});
