import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld} from '../telegram-state.mjs';
import {applyStoryText as say} from '../telegram-story.mjs';
const fire='Прилетел дракон',arrows='Люди стреляют в него из луков';

test('one persistent bow volley changes only its saved world, not its input',()=>{
  const fresh=initialWorld(456),missing=say(fresh,arrows);
  assert.equal(missing.kind,'blocked');
  assert.deepEqual(missing.world.resources,fresh.resources);
  const arrival=say(fresh,fire).world,stored=JSON.parse(JSON.stringify(arrival));
  const shot=say(stored,arrows);
  assert.equal(shot.kind,'defense');
  assert.equal(shot.world.story.last.scene,'story_defense');
  assert.equal(shot.world.story.dragon.health,2);
  assert.equal(shot.world.resources.budget,arrival.resources.budget-5);
  assert.deepEqual(say(stored,arrows),shot,'same snapshot must replay identically');
  assert.equal(stored.story.dragon.health,3,'stored input remains immutable');
  const reset=say(initialWorld(456,1),arrows);
  assert.match(reset.world.story.last.description,/Новый мир/);
});
test('legacy D1 dragon event restores an explicit target',()=>{
  const saved=say(initialWorld(457),fire).world;
  delete saved.story.dragon;
  saved.story.last={kind:'unknown',text:'later'};
  assert(Number.isInteger(say(saved,'Люди стреляют по нему из луков')
    .world.story.dragon.health));
});
test('a repeated arrival cannot heal or calm a wounded dragon',()=>{
  const arrived=say(initialWorld(458),fire).world;
  const shot=say(arrived,arrows).world;
  const next=say(shot,'Прилетел дракон и сел у реки').world;
  assert.equal(next.story.dragon.health,shot.story.dragon.health);
  assert.equal(next.story.dragon.temper,'hostile');
  assert.equal(next.story.active.kind,'dragon_fire');
});
test('negated/refused volleys do not spend or create story events',()=>{
  const world=say(initialWorld(459),fire).world;
  for(const text of ['Люди не стреляют в него из луков',
    'Лучники отказались выпускать стрелы в дракона',
    'Лучники перестали стрелять по дракону из луков']){
    const result=say(world,text);
    assert.equal(result.accepted,false,text);
    assert.equal(result.world.story.last.kind,'blocked',text);
    assert.deepEqual(result.world.resources,world.resources,text);
    assert.equal(result.world.history.length,world.history.length,text);
    assert.equal(result.world.story.dragon.health,3,text);
  }
});
