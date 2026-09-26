import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const engine=require('../lib/world-consequence-engine.js');
const {applyStoryText,applyStoryAction,advanceStoryDay}=await import('../telegram-story.mjs');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('actual Edge global and Node wrapper expose identical narrative arithmetic',()=>{
  const source=fs.readFileSync(path.join(root,'supabase/functions/_shared/world-consequence-engine.js'),'utf8');
  const context={globalThis:{}};vm.runInNewContext(source,context);
  const edge=context.globalThis.WorldConsequenceEngine;
  const world=engine.createWorld('narrative-edge-parity');
  for(const kind of Object.keys(engine.NARRATIVE_IMPACTS))
    assert.deepEqual(JSON.parse(JSON.stringify(edge.applyNarrativeEvent(world,kind))),
      engine.applyNarrativeEvent(world,kind),kind);
  for(const kind of ['dragon_fire','fire','flood','storm'])
    assert.deepEqual(JSON.parse(JSON.stringify(edge.applyNarrativeAftermath(world,kind))),
      engine.applyNarrativeAftermath(world,kind),kind);
});

test('canonical engine owns every immediate narrative resource delta',()=>{
  for(const [kind,impact] of Object.entries(engine.NARRATIVE_IMPACTS)){
    const before=engine.createWorld('narrative:'+kind);
    before.resources=Object.fromEntries(Object.keys(before.resources).map(key=>[key,50]));
    before.resources.budget=500;
    before.population=50;
    const frozen=structuredClone(before);
    const after=engine.applyNarrativeEvent(before,kind);
    assert.deepEqual(before,frozen,kind+' mutated its input');
    assert.equal(after.revision,before.revision+1,kind+' revision');
    for(const [key,amount] of Object.entries(impact)){
      const base=key==='population'?before.population:before.resources[key];
      const actual=key==='population'?after.population:after.resources[key];
      assert.equal(actual,base+amount,kind+':'+key);
    }
  }
});

test('canonical resource arithmetic is bounded, immutable and fail closed',()=>{
  const before=engine.createWorld('narrative-bounds');
  before.population=2;before.resources.health=99;before.resources.workers=2;
  const after=engine.applyResourceDelta(before,{workers:99,health:9,budget:-99999,population:-99});
  assert.equal(after.population,1);
  assert.equal(after.resources.health,100);
  assert.equal(after.resources.budget,-10000);
  assert.equal(after.resources.workers,1);
  assert.equal(before.population,2);
  assert.throws(()=>engine.applyResourceDelta(before,{secrets:1}),/UNKNOWN_RESOURCE/);
  assert.throws(()=>engine.applyResourceDelta(before,{health:Infinity}),/INVALID_RESOURCE_DELTA/);
  assert.throws(()=>engine.applyNarrativeEvent(before,'invented-by-ai'),/UNKNOWN_NARRATIVE_EVENT/);
  assert(Object.isFrozen(engine.NARRATIVE_IMPACTS));
  assert(Object.values(engine.NARRATIVE_IMPACTS).every(Object.isFrozen));
});

test('multi-day aftermath uses one canonical table without changing tick revision',()=>{
  const cases={dragon_fire:'burning',fire:'burning',flood:'flood',storm:'default'};
  for(const [kind,group] of Object.entries(cases)){
    const before=engine.createWorld('aftermath:'+kind);
    before.resources=Object.fromEntries(Object.keys(before.resources).map(key=>[key,50]));
    const after=engine.applyNarrativeAftermath(before,kind);
    assert.equal(after.revision,before.revision,kind+' must compose with the outer canonical tick');
    for(const [key,amount] of Object.entries(engine.NARRATIVE_AFTERMATH[group]))
      assert.equal(after.resources[key],before.resources[key]+amount,kind+':'+key);
  }
});

test('Telegram story transport has exact parity with canonical event and aftermath arithmetic',()=>{
  const before=engine.createWorld('telegram-parity');
  const expectedEvent=engine.applyNarrativeEvent(before,'dragon_fire');
  const story=applyStoryText(before,'Прилетел дракон и сжёг комплекс').world;
  assert.deepEqual(story.resources,expectedEvent.resources);
  assert.equal(story.population,expectedEvent.population);
  assert.equal(story.revision,expectedEvent.revision);

  const canonicalTick=engine.tick(story);
  const expectedDay=engine.applyNarrativeAftermath(canonicalTick,'dragon_fire');
  const actualDay=advanceStoryDay(story,canonicalTick);
  assert.deepEqual(actualDay.resources,expectedDay.resources);
  assert.equal(actualDay.population,expectedDay.population);
  assert.equal(actualDay.revision,expectedDay.revision);
});

test('evacuation and bounded return use canonical population arithmetic',()=>{
  const initial=engine.createWorld('canonical-evacuation');
  initial.resources.workers=initial.population;
  const threat=applyStoryText(initial,'Прилетел дракон и сжёг город').world;
  const moved=Math.min(4,threat.population-1);
  const evacuated=applyStoryAction(threat,'evacuate').world;
  assert.equal(evacuated.population,threat.population-moved);
  assert.equal(evacuated.story.evacuated,moved);
  assert.equal(evacuated.revision,threat.revision+1);
  assert(evacuated.resources.workers<=evacuated.population);

  const safe=structuredClone(evacuated);safe.story.active=null;
  let previous=safe,returned=0;
  while(previous.story.evacuated>0){
    const ticked=engine.tick(previous);
    const next=advanceStoryDay(previous,ticked);
    const count=next.history.at(-1).count;
    assert.equal(next.history.at(-1).kind,'telegram_story_return');
    assert(count>0&&count<=2);
    assert.equal(next.population,ticked.population+count);
    assert.equal(next.revision,ticked.revision);
    returned+=count;previous=next;
  }
  assert.equal(returned,moved);
  assert.equal(previous.story.evacuated,0);
});

test('population-only deltas cap workers and malformed evacuation state repairs safely',()=>{
  const world=engine.createWorld('evacuation-legacy');
  world.population=3;world.resources.workers=9;
  const reduced=engine.applyResourceDelta(world,{population:-2});
  assert.equal(reduced.population,1);
  assert.equal(reduced.resources.workers,1);
  assert.equal(world.resources.workers,9);

  const legacy=structuredClone(world);
  legacy.story={active:null,ruins:[],last:null,evacuated:Number.MAX_VALUE};
  const advanced=advanceStoryDay(legacy,engine.tick(legacy));
  assert.equal(advanced.story.evacuated,0);
  assert(!advanced.history.some(event=>event.kind==='telegram_story_return'));
});
