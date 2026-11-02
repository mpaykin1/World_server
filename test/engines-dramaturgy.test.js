'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createStoryBible,chooseEnding,validateStoryBible,CONFLICTS,TWISTS,ENDINGS} = require('../lib/engines/dramaturgy.cjs');

const gameCard={id:'independent-game',startLocation:'берег',short:true,world_laws:['ночью вода поднимается']};
test('identical random seed and history produce identical StoryBible', () => {
  const x=createStoryBible({gameCard,randomSeed:'same',recentGames:[]});
  const y=createStoryBible({gameCard,randomSeed:'same',recentGames:[]});
  assert.deepEqual(x,y);
  assert.deepEqual(validateStoryBible(x),{ok:true,errors:[]});
});
test('different seeds generate different plots without changing requirements',()=>{
  const a=createStoryBible({gameCard,randomSeed:'alpha'});
  const b=createStoryBible({gameCard,randomSeed:'beta'});
  assert.notDeepEqual(a,b);
  for(const x of [a,b]){
    assert.equal(x.conflicts.length,4);
    assert.equal(Object.keys(x.tempoStages).length,4);
    assert.equal(x.endings.length>=2,true);
    assert.equal(x.twists.every(t=>t.clues.length>=2&&t.clues.length<=3),true);
    assert.equal(x.repair.stage,'развязка');
    assert.equal(x.choices.length>=5&&x.choices.length<=7,true);
    assert.equal(x.openingLocation!==x.finalLocation||x.endingType==='замкнутый круг',true);
  }
});
test('the last three games exclude primary conflict and twist types',()=>{
  const history=[];
  for(const seed of ['one','two','three']){
    const bible=createStoryBible({gameCard,randomSeed:seed,recentGames:history});
    assert.equal(validateStoryBible(bible,history).ok,true);
    assert.equal(history.some(h=>h.primaryConflict===bible.primaryConflict),false);
    assert.equal(history.some(h=>h.twistType===bible.twistType),false);
    history.push(bible);
  }
  assert.equal(new Set(history.map(x=>x.primaryConflict)).size,3);
  assert.equal(CONFLICTS.length,6);
  assert.equal(TWISTS.length,10);
  assert.equal(ENDINGS.length,10);
});
test('choices determine an available ending',()=>{
  const bible=createStoryBible({gameCard,randomSeed:95});
  assert.equal(chooseEnding(bible,{жертва:10}),bible.endings[1]);
  assert.equal(chooseEnding(bible,{}),bible.endings[0]);
});
test('invalid story or duplicate adjacent game fails closed',()=>{
  const bible=createStoryBible({gameCard,randomSeed:'example'});
  assert.equal(validateStoryBible({...bible,repair:null}).ok,false);
  assert.equal(validateStoryBible(bible,[bible]).ok,false);
  assert.throws(()=>createStoryBible({randomSeed:null}),TypeError);
});
