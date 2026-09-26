import test from 'node:test';
import assert from 'node:assert/strict';
import {engine,initialWorld,applyPlan,describeChange} from '../telegram-state.mjs';
import {renderWorldFrame,WIDTH,HEIGHT} from '../telegram-animated-scene.mjs';
import {animatedWorldGif} from '../telegram-animated-gif.mjs';

test('same seed and saved game yield exactly the same scene and animation',()=>{
  const a=initialWorld(42),b=initialWorld(42);
  assert.deepEqual(renderWorldFrame(a),renderWorldFrame(b));
  assert.deepEqual(animatedWorldGif(a),animatedWorldGif(b));
});
test('construction immediately changes the image; commissioning changes it again',()=>{
  const empty=initialWorld(42);
  const started=applyPlan(empty,'solar').world;
  assert.notDeepEqual(renderWorldFrame(empty),renderWorldFrame(started));
  assert.match(describeChange(empty,started,'Солнечная станция'),/На карте появилась стройплощадка/);
  assert.match(describeChange(empty,started,'Солнечная станция'),/План после запуска/);
  const day1=engine.tick(started),day2=engine.tick(day1);
  assert.equal(day2.projects[0].active,true);
  assert.notDeepEqual(renderWorldFrame(started),renderWorldFrame(day2));
  assert.match(describeChange(day1,day2,'Следующий день'),/построены/);
  const day3=engine.tick(day2);
  assert.match(describeChange(day2,day3,'Следующий день'),/работают:/);
});
test('GIF89a contains a full scene and an animated partial frame at a bounded size',()=>{
  const world=applyPlan(initialWorld(42),'workshop').world;
  const gif=animatedWorldGif(world);
  assert.equal(new TextDecoder().decode(gif.slice(0,6)),'GIF89a');
  assert.equal(gif[6]|(gif[7]<<8),WIDTH);
  assert.equal(gif[8]|(gif[9]<<8),HEIGHT);
  assert.equal(gif.at(-1),0x3b);
  assert(gif.length>3000&&gif.length<350000,'Telegram animation stays small');
  assert.notDeepEqual(renderWorldFrame(world,0),renderWorldFrame(world,1));
});
test('water, ecology, volcano and progress control the map deterministically',()=>{
  const world=initialWorld(88);
  world.land.volcano=true;
  world.land.coast=true;
  const healthy=renderWorldFrame(world);
  world.resources.water=3;
  world.resources.ecology=10;
  world.crisis=true;
  assert.notDeepEqual(healthy,renderWorldFrame(world));
});
