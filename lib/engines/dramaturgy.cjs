'use strict';
const {validateRecentHistory} = require('./nonrepeat.cjs');

const CONFLICTS = Object.freeze(['себя','другого героя','природы','сверхъестественного','техники','общества']);
const CAUSES = Object.freeze(['ресурс','право','любовь','страх','память','месть']);
const TWISTS = Object.freeze(['ложный след','предательство','разоблачение личности','раскрытие мотива','узнавание','переворот положения','ложная победа','ненадежный рассказчик','поворот времени или взгляда','переосмысление причин']);
const SPEEDS = Object.freeze(['медленно и вдумчиво','ровно','рывком','пауза и взрыв','нарастающе']);
const STAGES = Object.freeze(['завязка','развитие','кульминация','развязка']);
const REPAIRS = Object.freeze(['искупление','компенсация','раскрытие причины','возможность ответить','новый союзник','возвращение контроля']);
const CHOICES = Object.freeze(['вслепую','информированный','по исходу действия','случайная ветвь','вне задуманного','характерообразующий','развилка с мотивацией','для атмосферы','доверить или нет','жертва','кого спасти','правду или скрыть','простить или наказать','бездействие','без хорошего выхода','скрытое последствие']);
const ENDINGS = Object.freeze([
  {type:'счастливая',places:['сад','храм']},
  {type:'горько-сладкая',places:['остров','море']},
  {type:'трагическая',places:['руины','пустошь']},
  {type:'искупление',places:['пещера','подземелье']},
  {type:'поворот',places:['лабиринт','мир сна','город золота']},
  {type:'замкнутый круг',places:['дом','деревня','дорога']},
  {type:'неоднозначная',places:['лес','море','мир сна']},
  {type:'открытая',places:['пустыня','космос','дорога']},
  {type:'обрыв на напряжении',places:['тоннель','неизведанный мир']},
  {type:'эпилог',places:['изменившееся место начала']}
]);
const MYSTERIES = Object.freeze([
  ['слух','установить первого рассказчика'],
  ['искажение при передаче','сравнить два пересказа'],
  ['подделанная записка','проверить бумагу и дату'],
  ['ложный свидетель','проверить независимый факт'],
  ['подброшенная улика','сверить время доступа'],
  ['самозванец или двойник','проверить неповторимую деталь'],
  ['двойной агент','сравнить действия двух лагерей'],
  ['шантаж','установить выгодополучателя молчания'],
  ['отвлекающий маневр','найти скрытую выгоду'],
  ['скрытая лояльность','раскрыть мотив перехода'],
  ['правда с опозданием','сверить время отправки'],
  ['дар с подвохом','проверить мотив дарителя'],
  ['ненадежная память','сверить дневник и очевидцев'],
  ['старая обида','найти доказательство перемены'],
  ['дефицит времени','найти пропущенную улику']
]);
const SOURCE_ROLES = Object.freeze(['помощник','друг','враг','наставник','незнакомец','любимый','никто']);
const HERO_ARCS = Object.freeze(['положительная перемена','плоская','разочарование','падение','разрушение добродетели','от страха к доверию','от порядка к свободе','от спасителя к ученику','от одиночки к лидеру','от уверенности к сомнению']);
const HAPPINESS = Object.freeze(['вернуть дом','получить прощение','быть признанным','освободиться от клятвы','узнать происхождение','защитить одного человека','создать наследие','исправить ошибку','начать заново','понять себя']);
const CLUES = Object.freeze(['двойная отметка в документах','противоречие во времени','повторяющаяся деталь предмета','необъяснимый жест свидетеля','мотив, скрытый в ранней сцене','след отсутствующего участника']);
const TRACE_KEYS = Object.freeze(['доверие','жертва','правда','милосердие','бездействие']);

function rngFrom(seed) {
  if (seed === undefined || seed === null) throw new TypeError('randomSeed is required');
  let h=2166136261;
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h=Math.imul(h,16777619); }
  return () => { h+=0x6D2B79F5; let x=h; x=Math.imul(x^(x>>>15),x|1); x^=x+Math.imul(x^(x>>>7),x|61); return ((x^(x>>>14))>>>0)/4294967296; };
}
function shuffle(pool,rng) {
  const a=[...pool];
  for(let i=a.length-1;i>0;i--) { const j=Math.floor(rng()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pick(pool,rng,forbidden=[]) {
  const available=pool.filter(v=>!forbidden.includes(v));
  if(!available.length) throw new Error('No nonrepeating story choice available');
  return available[Math.floor(rng()*available.length)];
}
function lastValues(recent,field,count=1) {
  return recent.slice(-count).flatMap(g=>g && typeof g[field]==='string'?[g[field]]:[]);
}
function tempoSignature(tempo) { return STAGES.map(s=>tempo[s]).join('|'); }
function choiceSignature(choices) { return [...choices].map(c=>typeof c==='string'?c:c.type).sort().join('|'); }

function candidateFor({gameCard={},recentGames=[],randomSeed},rng) {
  const conflict=pick(CONFLICTS,rng,lastValues(recentGames,'primaryConflict',3));
  const secondary=pick(CONFLICTS,rng,[conflict]);
  const knownTwists=recentGames.slice(-3).flatMap(g=>[g.twistType,...(Array.isArray(g.twists)?g.twists.map(t=>t.type):[])].filter(Boolean));
  const twistType=pick(TWISTS,rng,knownTwists);
  const secondTwist=pick(TWISTS,rng,[...knownTwists,twistType]);
  const previous=recentGames.at(-1)||{};
  const type=pick(ENDINGS.map(e=>e.type),rng,lastValues(recentGames,'endingType'));
  const endingFamily=ENDINGS.find(e=>e.type===type);
  const opening=gameCard.startLocation||'место начала';
  const candidatePlaces=endingFamily.places.filter(p=>type==='замкнутый круг'||p!==opening);
  const finalLocation=pick(candidatePlaces,rng,lastValues(recentGames,'finalLocation'));
  const alternatives=shuffle(ENDINGS.filter(e=>e.type!==type),rng).slice(0,2);
  const endings=[{type,finalLocation,trace:TRACE_KEYS[0]},...alternatives.map((e,i)=>({type:e.type,finalLocation:pick(e.places,rng,e.type==='замкнутый круг'?[]:[opening]),trace:TRACE_KEYS[i+1]}))];
  const tempoStages=Object.fromEntries(STAGES.map(s=>[s,pick(SPEEDS,rng)]));
  const repairType=pick(REPAIRS,rng,lastValues(recentGames,'repairType'));
  const selectedChoices=shuffle(CHOICES,rng).slice(0,5+Math.floor(rng()*3));
  // A choice type appears at most once; atmospheric choices are never the majority.
  const choices=selectedChoices.map((type,i)=>({type,stage:STAGES[i%STAGES.length],trace:TRACE_KEYS[i%TRACE_KEYS.length]}));
  // Without an authored cast, generate motive-bearing archetype cards, not a fixed canon.
  const cast=Array.isArray(gameCard.characters)&&gameCard.characters.length?
    gameCard.characters.filter(p=>p&&p.motive&&SOURCE_ROLES.includes(p.role)&&p.role!=='никто'):
    SOURCE_ROLES.filter(role=>role!=='никто').map(role=>({role,name:null,motive:pick(CAUSES,rng)}));
  const role=pick([...new Set(cast.map(p=>p.role)),'никто'],rng,lastValues(recentGames,'interferenceSourceType'));
  const motivated=cast.filter(p=>p.role===role);
  const actor=motivated.length?pick(motivated,rng):null;
  const mechanics=shuffle(MYSTERIES,rng).slice(0,2+Math.floor(rng()*2)).map(([type,reveal])=>({type,reveal,source:role}));
  const hintPool=shuffle(CLUES,rng);
  const twists=[twistType,secondTwist].map((t,i)=>({type:t,stage:i?'кульминация':'развитие',clues:shuffle(hintPool,rng).slice(0,2+i)}));
  const hero={arc:pick(HERO_ARCS,rng,lastValues(recentGames,'heroArc')),happiness:pick(HAPPINESS,rng,lastValues(recentGames,'heroHappiness'))};
  return {
    gameId:gameCard.id||null,randomSeed:String(randomSeed),
    primaryConflict:conflict,secondaryConflict:secondary,conflictCause:pick(CAUSES,rng,lastValues(recentGames,'conflictCause')),
    conflicts:[{level:'внутренний',type:conflict},{level:'межличностный',type:secondary},{level:'общественный',type:conflict},{level:'мировой',type:secondary}],
    hero,heroArc:hero.arc,heroHappiness:hero.happiness,
    characters:cast,lines:gameCard.short===true?['герой–друг','герой–враг','герой–тайна']:['герой–друг','герой–враг','герой–тайна','герой–любовь','герой–потеря'],
    world_laws:Array.isArray(gameCard.world_laws)?gameCard.world_laws:[],
    twistType,twists,clues:twists.flatMap(t=>t.clues),
    tempoStages,repairType,repair:{type:repairType,afterTwist:twistType,stage:'развязка'},
    choices,mysteryMechanics:mechanics,
    interferenceSourceType:role,interferenceSource:role==='никто'?{type:'никто',motive:'ошибка или недоразумение'}:{type:role,character:actor?.name||null,motive:actor?.motive},
    endingType:type,finalLocation,endings,openingLocation:opening
  };
}
function validateStoryBible(bible,recentGames=[]) {
  if (!bible||typeof bible!=='object'||!Array.isArray(recentGames)) return {ok:false,errors:['StoryBible and recentGames required']};
  const errors=[];
  const has=(x)=>typeof x==='string'&&x.trim().length>0;
  for(const k of ['primaryConflict','twistType','endingType','finalLocation','interferenceSourceType','repairType']) {
    if(!has(bible[k])) errors.push(k+': missing');
  }
  if(!CONFLICTS.includes(bible.primaryConflict)) errors.push('invalid primary conflict');
  if(!Array.isArray(bible.conflicts)||bible.conflicts.length!==4)errors.push('four conflict levels required');
  if(!bible.tempoStages||STAGES.some(k=>!SPEEDS.includes(bible.tempoStages[k]))) errors.push('four individual tempi required');
  if(!bible.repair||bible.repair.stage!=='развязка'||bible.repair.afterTwist!==bible.twistType) errors.push('painful twist requires later repair');
  if(!Array.isArray(bible.twists)||new Set(bible.twists.map(t=>t.type)).size!==bible.twists.length||
    bible.twists.some(t=>!Array.isArray(t.clues)||t.clues.length<2||t.clues.length>3)) errors.push('twists need unique types and 2-3 clues');
  if(!Array.isArray(bible.choices)||bible.choices.length<5||bible.choices.length>7||
    bible.choices.some((c,i)=>i>0&&c.type===bible.choices[i-1].type)||
    bible.choices.filter(c=>c.type==='для атмосферы').length>bible.choices.length/3)errors.push('invalid choice pacing');
  if(!Array.isArray(bible.mysteryMechanics)||bible.mysteryMechanics.length<2||bible.mysteryMechanics.length>3||
    bible.mysteryMechanics.some(x=>!has(x.reveal))) errors.push('mystery mechanisms must be solvable');
  if(!Array.isArray(bible.endings)||bible.endings.length<2||bible.endings[0]?.type!==bible.endingType)errors.push('branching endings required');
  if(bible.openingLocation===bible.finalLocation&&bible.endingType!=='замкнутый круг')errors.push('final location equals opening');
  if(recentGames.length) {
    errors.push(...validateRecentHistory(recentGames,bible).errors);
    if(tempoSignature(recentGames.at(-1).tempoStages||{})===tempoSignature(bible.tempoStages))errors.push('tempo combination repeated');
    if(choiceSignature(recentGames.at(-1).choices||[])===choiceSignature(bible.choices))errors.push('choice menu repeated');
    if(recentGames.slice(-3).some(g=>g.twistType===bible.twistType))errors.push('twist cooldown');
  }
  return {ok:errors.length===0,errors};
}
function createStoryBible(options={}) {
  if(!Array.isArray(options.recentGames||[]))throw new TypeError('recentGames must be array');
  const rng=rngFrom(options.randomSeed);
  for(let i=0;i<300;i++){
    const bible=candidateFor(options,rng);
    if(validateStoryBible(bible,options.recentGames||[]).ok)return bible;
  }
  throw new Error('No nonrepeating StoryBible available for recent history');
}
function chooseEnding(bible,traces={}) {
  if(!bible||!Array.isArray(bible.endings)||!bible.endings.length)throw new TypeError('StoryBible required');
  const ranked=Object.entries(traces).filter(([key,val])=>TRACE_KEYS.includes(key)&&Number.isFinite(val))
    .sort((a,b)=>b[1]-a[1]||TRACE_KEYS.indexOf(a[0])-TRACE_KEYS.indexOf(b[0]));
  const key=ranked[0]?.[0];
  return bible.endings.find(e=>e.trace===key)||bible.endings[0];
}
module.exports={createStoryBible,chooseEnding,validateStoryBible,CONFLICTS,TWISTS,CHOICES,ENDINGS,MYSTERIES,SPEEDS,REPAIRS};
