import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld} from '../telegram-state.mjs';
import {applyStoryText as say} from '../telegram-story.mjs';
const dragon='Прилетел дракон',arrows='Люди стреляют в него из луков';

test('dragon volley is deterministic and isolated by world',()=>{
  const arrived=say(initialWorld(456),dragon).world;
  const saved=JSON.parse(JSON.stringify(arrived)),shot=say(saved,arrows);
  assert.deepEqual([shot.kind,shot.world.story.last.scene,
    shot.world.story.dragon.health,shot.world.resources.budget],
    ['defense','story_defense',2,arrived.resources.budget-5]);
  assert.deepEqual(say(saved,arrows),shot);
  assert.equal(saved.story.dragon.health,3);
  assert.match(say(initialWorld(456,1),arrows).world.story.last.description,/Новый мир/);
});
test('legacy D1 history recovers the dragon after unrelated text',()=>{
  const saved=say(initialWorld(457),dragon).world;
  delete saved.story.dragon;
  saved.story.last={kind:'unknown',text:'later'};
  assert(Number.isInteger(say(saved,'Люди стреляют по нему из луков')
    .world.story.dragon.health));
});
test('arrival cannot heal a wounded dragon',()=>{
  const arrived=say(initialWorld(458),dragon).world,shot=say(arrived,arrows).world;
  const repeat=say(shot,'Прилетел дракон и сел у реки').world;
  assert.deepEqual([repeat.story.dragon.health,repeat.story.dragon.temper,
    repeat.story.active.kind],[shot.story.dragon.health,'hostile','dragon_fire']);
});
test('negated or refused arrows do not create events or spend resources',()=>{
  const saved=say(initialWorld(459),dragon).world;
  for(const text of ['Люди не стреляют в него из луков',
    'Лучники отказались выпускать стрелы в дракона',
    'Лучники перестали стрелять по дракону из луков']){
    const shot=say(saved,text);
    assert.deepEqual([shot.accepted,shot.world.story.last.kind,shot.world.resources,
      shot.world.history.length,shot.world.story.dragon.health],
      [false,'blocked',saved.resources,saved.history.length,3],text);
  }
});
