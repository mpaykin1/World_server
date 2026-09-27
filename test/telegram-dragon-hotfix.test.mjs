import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld} from '../telegram-state.mjs';
import {applyStoryText} from '../telegram-story.mjs';

test('dragon memory resolves arrows, persists and drives deterministic fallout',()=>{
  const initial=initialWorld(456);
  const missing=applyStoryText(initial,'Люди стреляют в него из луков');
  assert.equal(missing.kind,'blocked');
  assert.deepEqual(missing.world.resources,initial.resources);
  const arrived=applyStoryText(initial,'Прилетел дракон').world;
  assert.equal(arrived.story.dragon.present,true);
  const restored=structuredClone(JSON.parse(JSON.stringify(arrived)));
  const shot=applyStoryText(restored,'Люди стреляют в него из луков');
  assert.equal(shot.kind,'defense');
  assert.equal(shot.world.story.last.scene,'story_defense');
  assert.equal(shot.world.resources.budget,arrived.resources.budget-5);
  assert.deepEqual(applyStoryText(restored,'Люди стреляют в него из луков'),shot);
  assert.equal(restored.story.dragon.health,3);
  const reset=applyStoryText(initialWorld(456,1),'Люди стреляют в него из луков');
  assert.match(reset.world.story.last.description,/Новый мир/);
});
test('legacy narrative history restores dragon target',()=>{
  const arrived=applyStoryText(initialWorld(457),'Прилетел дракон').world;
  delete arrived.story.dragon;
  arrived.story.last={kind:'unknown',text:'Событие позже'};
  const shot=applyStoryText(arrived,'Люди стреляют по нему из луков');
  assert.equal(shot.kind,'defense');
  assert(Number.isInteger(shot.world.story.dragon.health));
});

test('repeated dragon arrival cannot heal an injured or enraged dragon',()=>{
  const arrived=applyStoryText(initialWorld(458),'Прилетел дракон').world;
  const shot=applyStoryText(arrived,'Люди стреляют в него из луков').world;
  assert.equal(shot.story.dragon.temper,'hostile');
  const repeated=applyStoryText(shot,'Прилетел дракон и сел у реки').world;
  assert.equal(repeated.story.dragon.health,shot.story.dragon.health);
  assert.equal(repeated.story.dragon.temper,'hostile');
  assert.equal(repeated.story.active.kind,'dragon_fire');
});
