import test from 'node:test';
import assert from 'node:assert/strict';
import {initialWorld,applyPlan,engine,view} from '../telegram-state.mjs';
import {classifyStoryText,STORY_SCENES} from '../telegram-story-parse.mjs';
import {applyStoryText,applyStoryAction,advanceStoryDay} from '../telegram-story.mjs';
import {makeVisualTurn,sceneMedia,classifyTurn,MEDIA_SCENES} from '../telegram-scenes.mjs';

function tourWorld(){
  const initial=initialWorld(42);
  const built=applyPlan(initial,'tourism');
  assert.equal(built.accepted,true);
  return engine.tick(engine.tick(built.world));
}
test('dragon burns the existing complex; no workshop is secretly constructed',()=>{
  const original=tourWorld(),p=original.projects.at(-1);
  assert.equal(p.active,true);
  const story='Прилетел дракон и сжег комплекс';
  const result=applyStoryText(original,story);
  assert.equal(result.kind,'dragon_fire');
  assert.equal(result.action,'story');
  assert.equal(result.world.revision,original.revision+1);
  assert(!result.world.projects.some(project=>project.id===p.id));
  assert.equal(result.world.story.ruins.at(-1).type,'tourism');
  assert.equal(result.world.story.active.kind,'dragon_fire');
  assert(result.world.resources.power<original.resources.power);
  assert(result.world.resources.ecology<original.resources.ecology);
  assert(result.world.resources.budget<original.resources.budget);
  assert(result.world.population<original.population);
  assert.equal(original.projects.at(-1).active,true,'input world remains immutable');
  const visual=makeVisualTurn(original,result.world,'story','dragon_fire',531,view(result.world));
  assert.match(visual.text,/дракон|Дракон/i);
  assert.match(visual.text,/комплекс/i);
  assert.match(visual.media.animation,/story_dragon_fire-[0-2]\.mp4$/);
  assert.match(visual.text,/🏚|Разрушено/);
  assert(visual.reply_markup.inline_keyboard.some(row=>
    row.some(button=>button.callback_data.endsWith(':extinguish'))));
});
test('fire continues during the next day, then can be extinguished and rebuilt',()=>{
  const attack=applyStoryText(tourWorld(),'Дракон сжег комплекс').world;
  const nextDay=advanceStoryDay(attack,engine.tick(attack));
  assert(nextDay.resources.health<attack.resources.health);
  assert.equal(classifyTurn(attack,nextDay,'day').id,'story_dragon_aftermath');
  const extinguished=applyStoryAction(nextDay,'extinguish').world;
  assert.equal(extinguished.story.active,null);
  assert.equal(extinguished.story.ruins.length,1);
  assert.equal(classifyTurn(nextDay,extinguished,'story').id,'story_extinguish');
  const afterFire=advanceStoryDay(extinguished,engine.tick(extinguished));
  assert.equal(classifyTurn(extinguished,afterFire,'day').id,'story_dragon_aftermath');
  assert.equal(classifyTurn(afterFire,afterFire,'resume').id,'story_dragon_aftermath');
  const rebuilt=applyStoryAction(extinguished,'rebuild');
  assert.equal(rebuilt.accepted,true);
  assert(rebuilt.world.story.ruins[0].rebuilding);
  const day1=advanceStoryDay(rebuilt.world,engine.tick(rebuilt.world));
  const day2=advanceStoryDay(day1,engine.tick(day1));
  assert.equal(day2.story.ruins.length,0,'ruins clear only after construction ends');
  assert(day2.projects.some(x=>x.type==='tourism'&&x.active));
  assert.match(day2.story.last.title,/снова построен/);
});
test('different free-form plots apply different real effects, not a workshop',()=>{
  const cases=[
    ['Прилетел дракон и подарил городу золото','dragon_help','budget',1],
    ['Наводнение затопило город','flood','power',-1],
    ['Началась эпидемия','epidemic','health',-1],
    ['Пошли сильные дожди','rain','water',1],
    ['Мы посадили лес','forest','ecology',1],
    ['Метеорит уничтожил завод','meteor','budget',-1],
    ['Настал праздник','festival','budget',-1],
    ['Пришли торговцы','trade','budget',1]
  ];
  for(const [text,kind,key,sign] of cases){
    const initial=initialWorld(19),out=applyStoryText(initial,text);
    assert.equal(out.kind,kind,text);
    assert((out.world.resources[key]-initial.resources[key])*sign>0,text);
    assert(!out.world.projects.some(x=>x.type==='workshop'),text);
    assert(MEDIA_SCENES.includes(classifyTurn(initial,out.world,'story').id));
  }
});
test('unrecognized plot is recorded and illustrated without inventing a workshop',()=>{
  const before=initialWorld(89);
  const out=applyStoryText(before,'Луна превратилась в сыр');
  assert.equal(out.kind,'unknown');
  assert.equal(out.world.projects.length,0);
  assert.deepEqual(out.world.resources,before.resources);
  const visual=makeVisualTurn(before,out.world,'story','unknown',20,view(out.world));
  assert.match(visual.text,/Луна превратилась в сыр/);
  assert.match(visual.text,/уточни/);
  assert.match(visual.media.animation,/story_unknown/);
});
test('existing building intents still use canonical project engine',()=>{
  const w=initialWorld(42);
  const out=applyStoryText(w,'Построить солнечные панели, чтобы пережить кризис');
  assert.equal(out.action,'start');
  assert.equal(out.kind,'solar');
  assert.equal(out.world.projects.at(-1).type,'solar');
  assert.equal(classifyTurn(w,out.world,'start').id,'start_solar');
});
test('story renderer covers every supported scene with consistent assets',()=>{
  const w=initialWorld(14);
  for(const scene of STORY_SCENES){
    assert(MEDIA_SCENES.includes(scene),scene);
    const media=sceneMedia({id:scene},w,5);
    assert(media.animation.endsWith('.mp4'));
    assert(media.photo.endsWith('.png'));
  }
});
test('negation-free dragon arrival is not falsely treated as a fire',()=>{
  const w=initialWorld(14);
  const out=applyStoryText(w,'Прилетел дракон и сел у реки');
  assert.equal(out.kind,'dragon_arrival');
  assert.equal(out.world.story.active,null);
  assert.equal(out.world.story.ruins.length,0);
});
test('free-form rescue action does not require pressing a menu first',()=>{
  const w=applyStoryText(initialWorld(42),'Прилетел дракон и сжег комплекс').world;
  assert.equal(classifyStoryText('Потушить пожар').action,'extinguish');
  const rescued=applyStoryText(w,'Потушить пожар');
  assert.equal(rescued.kind,'extinguish');
  assert.equal(rescued.world.story.active,null);
  const denial=applyStoryText(rescued.world,'Потушить пожар');
  assert.equal(denial.accepted,false);
  assert.match(denial.world.story.last.description,/Нечего тушить/);
});
