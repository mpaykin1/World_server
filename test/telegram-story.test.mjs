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
test('unsupported custom construction does not turn into workshop or invent effects',()=>{
  const w=initialWorld(30);
  const out=applyStoryText(w,'Построить больницу для жителей');
  assert.equal(out.kind,'unknown');
  assert.equal(out.world.projects.length,0);
  assert.deepEqual(out.world.resources,w.resources);
  const reply=makeVisualTurn(w,out.world,'story','unknown',1,view(out.world));
  assert.match(reply.text,/больниц/);
  assert.match(reply.text,/не стал подменять/);
  assert.match(reply.media.animation,/story_unknown/);
});
test('coal power station text builds coal, not geothermal despite electricity keyword',()=>{
  const w=initialWorld(50);
  const out=applyStoryText(w,'Построить угольную электростанцию');
  assert.equal(out.kind,'coal');
  assert.equal(out.world.projects[0].type,'coal');
  assert.match(out.world.projects[0].intent.comment,/угольную/);
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

test('archers react to an existing dragon referenced as him',()=>{
  const start=initialWorld(73);
  const missing=applyStoryText(start,'Люди стреляют в него из луков');
  assert.equal(missing.kind,'blocked','no dragon must not be invented');
  assert.match(missing.world.story.last.description,/В этом мире нет дракона/);
  assert.deepEqual(missing.world.resources,start.resources);
  const arrival=applyStoryText(start,'Прилетел дракон').world;
  assert.equal(arrival.story.dragon.present,true);
  assert.equal(arrival.story.active,null,'arrival itself is peaceful');
  const shot=applyStoryText(arrival,'Люди стреляют в него из луков');
  assert.equal(shot.accepted,true);
  assert.equal(shot.kind,'defense');
  assert.equal(shot.world.story.dragon.health,2);
  assert.equal(shot.world.story.active.kind,'dragon_fire');
  assert.equal(shot.world.resources.budget,arrival.resources.budget-5);
  assert.equal(shot.world.population,arrival.population);
  assert.equal(shot.world.story.last.scene,'story_defense');
  assert.equal(classifyTurn(arrival,shot.world,'story').id,'story_defense');
  assert(view(arrival).reply_markup.inline_keyboard.flat().some(button=>
    button.callback_data.endsWith(':shoot_dragon')));
  assert.deepEqual(applyStoryText(arrival,'Люди стреляют в него из луков'),shot,
    'the outcome must be reproducible from the same revision');
  assert.equal(arrival.story.dragon.health,3,'input is immutable');
});
test('typed archery rejects other targets and a reversed dragon actor',()=>{
  const arrived=applyStoryText(initialWorld(73),'Прилетел дракон').world;
  for(const text of ['Люди стреляют в волков из луков',
    'Люди стреляют по мишеням из луков','Дракон стреляет в людей из лука',
    'Люди видят волков и стреляют в него из луков',
    'Люди не стреляют в него из луков',
    'Люди перестали стрелять в него из луков',
    'Люди отказались стрелять в него из луков',
    'Люди отказываются стрелять в него из луков',
    'Люди отказались бы стрелять в него из луков',
    'Люди не смогли стрелять в него из луков',
    'Люди пока не начали стрелять в него из луков',
    'Лучники неспособны стрелять в него из луков',
    'Горожане закончили стрелять в него из луков',
    'People refuse to shoot him with bows',
    "People don't shoot him with bows",
    'People cannot shoot him with bows',
    'People refused shooting at him with bows',
    'People stopped trying to shoot him with bows',
    'People are incapable of shooting at him with bows',
    'Citizens decline to shoot him with bows',
    'Archers quit shooting at him with bows',
    'People ceased shooting at him with bows',
    'Люди отстрелялись по нему из луков',
    'Жители уже отстрелялись в дракона из луков',
    'Лучники завершили стрелять в него из луков',
    'Солдаты лишены возможности стрелять в него из луков',
    'Мы против того, чтобы стрелять в него из луков',
    'People finished shooting at him with bows',
    'Citizens have finished shooting at him with bows',
    'Archers completed shooting at him with bows',
    'We no longer shoot him with bows',
    'People lack the ability to shoot him with bows',
    'Citizens are against shooting at him with bows',
    'People shoot him with bows no longer',
    'People shoot him with bows, but not anymore',
    'Люди стреляют в него из луков, но передумали',
    'Рыцарь рядом. Люди стреляют по нему из луков',
    'Орк рядом. Люди стреляют по нему из луков',
    'Knight nearby. People shoot him with bows',
    'Goblin nearby. People shoot him with bows',
    'Лучники перестали выпускать стрелы в дракона',
    'Лучники отказались выпускать стрелы в дракона',
    'Лучники закончили выпускать стрелы в дракона',
    'Лучники прекратили выпускать стрелы в дракона',
    'Лучники не стали выпускать стрелы в дракона',
    'Лучники перестали пускать стрелы по дракону',
    'Лучники отказались пускать стрелы по дракону',
    'Лучники закончили пускать стрелы по дракону',
    'Лучники прекратили пускать стрелы по дракону',
    'Лучники не стали пускать стрелы по дракону',
    'Волк рядом. Люди стреляют по нему из луков',
    'Люди видят, как дракон стреляет в людей из лука',
    'Люди стреляют не в дракона из луков',
    'Люди стреляют из луков, а дракон наблюдает']){
    const result=applyStoryText(arrived,text);
    assert.equal(result.accepted,false,text);
    assert.equal(result.kind,'blocked',text);
    assert.match(result.world.story.last.description,/кто стреляет и в кого/,text);
    assert.deepEqual(result.world.resources,arrived.resources,text);
    assert.deepEqual(result.world.story.dragon,arrived.story.dragon,text);
    assert.equal(result.world.story.active,arrived.story.active,text);
    assert.equal(result.world.history.filter(x=>
      x.kind==='telegram_story_dragon_arrows').length,0,text);
  }
  assert.equal(classifyStoryText('Лучники стреляют в дракона из луков',arrived).action,
    'shoot_dragon');
  assert.equal(classifyStoryText('Дракон рядом. Люди стреляют по нему из луков',arrived).action,
    'shoot_dragon');
  assert.equal(classifyStoryText('People shoot the dragon with bows',arrived).action,
    'shoot_dragon');
  for(const text of ['Люди быстро стреляют в дракона из луков',
    'Лучники начали стрелять по нему из луков',
    'Люди сейчас активно стреляют в дракона из луков',
    'People are shooting at the dragon with bows',
    'Archers started shooting at him with bows',
    'People are actively shooting at the dragon with bows',
    'People suddenly shoot the dragon with bows',
    'Лучники стреляют из луков по дракону',
    'Люди стреляют стрелами в дракона',
    'Прилетел дракон. Жители стреляют по нему из луков',
    'В небе дракон. Лучники стреляют по нему из луков',
    'The archers are shooting at the dragon with bows',
    'People are shooting arrows at the dragon',
    'Archers shoot arrows at him',
    'The dragon is nearby. People shoot him with bows',
    'A dragon arrived. Archers shoot him with arrows',
    'Archers fired arrows at the dragon',
    'The people fired at him with bows',
    'Лучники выпустили стрелы в дракона',
    'Жители пустили стрелы по дракону',
    'A dragon appeared. People shoot him with bows',
    'The dragon appeared nearby. The archers shoot him with arrows',
    'Дракон появился над городом. Жители стреляют по нему из луков',
    'Над городом появился дракон. Лучники стреляют по нему из луков',
    'People shoot at the dragon with the bows'])
    assert.equal(classifyStoryText(text,arrived).action,'shoot_dragon',text);
  for(const text of ["Fire destroyed the archers' bows",
    'The people fled the fire with bows'])
    assert.equal(classifyStoryText(text,arrived).kind,'fire',text);
});
test('dragon can flee after repeated arrow volleys',()=>{
  let w=applyStoryText(initialWorld(74),'Прилетел дракон').world;
  for(let i=0;i<6&&w.story.dragon.present;i++)
    w=applyStoryText(w,'Лучники стреляют по нему из луков').world;
  assert.equal(w.story.dragon.present,false);
  assert.equal(w.story.active,null);
  assert.equal(view(w).reply_markup.inline_keyboard.flat().some(button=>
    button.callback_data.endsWith(':shoot_dragon')),false);
  const unavailable=applyStoryText(w,'Лучники стреляют в дракона из луков');
  assert.equal(unavailable.kind,'blocked');
  assert.deepEqual(unavailable.world.resources,w.resources);
});

test('legacy D1 session remembers the dragon after an unsupported follow-up',()=>{
  const arrival=applyStoryText(initialWorld(92),'Прилетел дракон').world;
  const legacy=structuredClone(arrival);
  delete legacy.story.dragon;
  const missed=applyStoryText(legacy,'Мимо прошла странная тень').world;
  assert.equal(missed.story.last.kind,'unknown');
  assert(view(missed).reply_markup.inline_keyboard.flat().some(button=>
    button.callback_data.endsWith(':shoot_dragon')));
  const corrected=applyStoryText(missed,'Люди стреляют в него из луков');
  assert.equal(corrected.kind,'defense');
  assert.equal(corrected.world.story.dragon.health,2);
  assert.equal(corrected.world.resources.budget,missed.resources.budget-5);
});

test('New World explicitly resets old dragon; follow-up explains missing target',()=>{
  const old=applyStoryText(initialWorld(53),'Прилетел дракон').world;
  const fresh=initialWorld(53,1);
  assert(old.story.dragon.present);
  assert.equal(fresh.story,undefined);
  const reply=applyStoryText(fresh,'Люди стреляют в него из луков');
  assert.equal(reply.kind,'blocked');
  assert.match(reply.world.story.last.description,/Новый мир/);
  assert.deepEqual(reply.world.resources,fresh.resources);
});

test('corrupt persisted dragon health repairs before an arrow hit',()=>{
  const old=applyStoryText(initialWorld(79),'Прилетел дракон').world;
  const corrupt=structuredClone(old);
  corrupt.story.dragon.health={untrusted:true};
  const result=applyStoryText(corrupt,'Люди стреляют в него из луков');
  assert.equal(result.kind,'defense');
  assert.equal(result.world.story.dragon.health,2);
  assert.equal(corrupt.story.dragon.health.untrusted,true,'input stays untouched');
});
