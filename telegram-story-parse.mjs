// Cheap deterministic intent routing; no LLM calls and no silent workshop fallback.
// Matching is deliberately conservative: ambiguous plot twists are recorded,
// illustrated as unclassified, and ask the player what changes physically.
export const STORY_SCENES=[
  'story_dragon_fire','story_dragon_arrival','story_dragon_help',
  'story_dragon_aftermath','story_fire','story_flood','story_storm',
  'story_earthquake','story_meteor','story_epidemic','story_attack',
  'story_rain','story_drought','story_forest','story_festival',
  'story_trade','story_rescue','story_extinguish','story_evacuation',
  'story_rebuild','story_defense','story_recovery','story_unknown'
];
export const STORY_ACTIONS=new Set([
  'extinguish','evacuate','defend','rebuild','relief','shoot_dragon'
]);
const rules=[
  ['fire',/пожар|огонь|сгорел|сгорел[аи]|сгоревш|сожг|сж[её]г|горит|подж[её]г|wildfire|fire/i],
  ['flood',/наводнен|затоп|цунами|потоп|flood/i],
  ['storm',/ураган|бур[яи]|торнадо|смерч|шторм|storm/i],
  ['earthquake',/землетряс|сотряс|разлом|earthquake/i],
  ['meteor',/метеор|астерои[дт]|комет[аы]|meteor|asteroid/i],
  ['epidemic',/эпидеми|пандем|вирус|зараз|болезн|plague|epidemic/i],
  ['attack',/напал|нападен|враг|армия|обстрел|бомб|война|invad|attack/i],
  ['drought',/засух|пересох|нет воды|drought/i],
  ['rain',/пош[её]л дожд|дожди|ливен|rain/i],
  ['forest',/посадил.*лес|вырос.*лес|посадк[аи].*дерев|озелен|forest/i],
  ['festival',/праздник|фестивал|концерт|вечерин|festival/i],
  ['trade',/торговл|торговат|торговц|экспорт|рынок|караван|trade/i],
  ['rescue',/спас[лт]|помо[гщ]|вылеч|помощ|rescue/i]
];
// No default workshop: an unknown building must never impersonate another one.
const BUILDINGS=[
  ['solar',/солнеч|панел/],['coal',/угольн|теплоэлектр/],
  ['geothermal',/геотерм|гейзер|вулкан.*электро/],
  ['water_recycling',/переработ.*вод|очистн.*сооружен/],
  ['desalination',/опресн/],['deep_wells',/скважин|колодц/],
  ['greenhouse',/теплиц/],['intensive_farm',/ферм|агрокомплекс/],
  ['tourism',/турист|гостиниц|отел|курорт/],['workshop',/мастерск|цех/],
  ['temple',/храм|культурн.*центр/],['festival',/фестивал/],
  ['export_market',/торгов.*рынок|рынок/],['luxury_arcology',/жилой.*район|жилой.*комплекс/],
  ['automated_mine',/шахт|рудник/],['water_park',/аквапарк/],
  ['bottling_plant',/завод.*вод/],['biofuel_refinery',/биотоплив/],
  ['livestock_export',/животновод/],['volcanic_farm',/вулканич.*ферм/]
];
export function supportedBuildType(text){
  return BUILDINGS.find(([,pattern])=>pattern.test(text))?.[0]||null;
}

const isBuilding=/постро|возв[её]л|возвест|строить|созда[тл].*(?:станци|ферм|завод|комплекс|город)|build/i;
const actionPatterns=[
  ['extinguish',/потуш|затуш|туш[ие]|огнетуш|extinguish/i],
  ['evacuate',/эваку|укры|увест.*жител|спасти.*люд|evacuat/i],
  ['defend',/защит|оборон|отогна|дракон.*уб[ие]|defend/i],
  ['rebuild',/восстанов|отстро|почин|ремонт|rebuild/i],
  ['relief',/гуманитар|помочь пострадав|раздать.*(?:еду|воду)|relief/i]
];
export function dragonPresent(world){
  const story=world?.story;
  if(!story)return false;
  if(story.dragon!==undefined)return Boolean(story.dragon?.present);
  // D1 worlds saved before the dragon entity was introduced still contain
  // their private narrative history, even after an unrecognized follow-up.
  return ['dragon_arrival','dragon_fire','dragon_help'].includes(story.last?.kind)||
    story.active?.kind==='dragon_fire'||
    Boolean(Array.isArray(world.history)&&world.history.some(event=>
      event&&typeof event==='object'&&
      /^telegram_story_dragon_(?:arrival|fire|help)$/.test(event.kind)));
}
function classifyArchery(text){
  const shot=/(?:стреля(?:ют|ет|ем|ете|л[аи]?|ть)|выстрел(?:ил[аи]?|или|ить)|выпустил[аи]?\s+стрел|выпустили\s+стрел|пустил[аи]?\s+стрел|пустили\s+стрел|shoot(?:s|ing)?)/i.exec(text);
  const bow=/(?:лук(?:а|ов|ами)?|стрел(?:а|ы|ами)?|bows?|arrows?)/i.test(text);
  if(!shot||!bow)return null;
  const before=text.slice(0,shot.index);
  const clauseBreak=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),
    before.lastIndexOf('?'));
  const clauseBefore=before.slice(clauseBreak+1);
  const priorText=clauseBreak>=0?before.slice(0,clauseBreak).trim():'';
  const priorClause=priorText.slice(Math.max(priorText.lastIndexOf('.'),
    priorText.lastIndexOf('!'),priorText.lastIndexOf('?'))+1);
  const after=text.slice(shot.index+shot[0].length);
  const actor=/^\s*(?:люди|жители|горожане|лучники|воины|солдаты|мы|(?:the\s+)?(?:people|citizens|archers)|we)(?:\s+([^.!?]{0,60}?))?\s*$/i.exec(clauseBefore);
  const bridge=String(actor?.[1]||'').trim();
  // Fail closed: only known positive auxiliaries/adverbs may occur between the
  // actor and the shooting verb. Unknown modality is clarified, never charged.
  const positiveBridge=/^(?:быстро|сразу|метко|дружно|решительно|снова|вновь|уверенно|неохотно|уже|сейчас|активно|внезапно|начинают|начали|решили|продолжают|продолжили|и|are|is|were|have|keep|keeps|quickly|immediately|accurately|together|decisively|reluctantly|actively|suddenly|again|now|still|begin|began|start|started|continue|continued|decide|decided|trying|to)$/i;
  const groundedBridge=!bridge||bridge.split(/\s+/).every(word=>positiveBridge.test(word));
  const humanActor=Boolean(actor)&&groundedBridge&&!/(?:дракон|dragon)/i.test(clauseBefore);
  const negated=/(?:^|\s)(?:не|ни|нет|без|(?:отказ|перест|прекрат|избег|неспособ|закончил)[а-яё]*)(?=\s|$)/i.test(clauseBefore)||
    /\b(?:not|never|cannot|cant|can't|wont|won't|dont|don't|doesnt|doesn't|didnt|didn't|refus\w*|stop\w*|avoid\w*|unable|incapable|declin\w*|quit\w*|ceas\w*)\b/i.test(clauseBefore);
  const explicitDragon=/(?:(?:в|по)\s+дракон(?:а|у|ом)?(?:\s|$)|at\s+(?:the\s+)?dragon|^\s*(?:the\s+)?dragon(?:\s|$))/i.test(after);
  const pronoun=/(?:(?:в|по)\s+(?:него|нему)(?:\s|$)|(?:at\s+him|him))/i.test(after);
  const positiveAfter=/^(?:\s*(?:в|по)\s+(?:него|нему|дракон(?:а|у|ом)?)\s+(?:из\s+)?(?:лука|луков|стрел(?:а|ы|ами)?)|\s*(?:из\s+)?(?:лука|луков|стрел(?:а|ы|ами)?)\s+(?:в|по)\s+(?:него|нему|дракон(?:а|у|ом)?)|\s*(?:at\s+)?(?:him|(?:the\s+)?dragon)\s+(?:with\s+)?(?:bows?|arrows?)|\s*(?:with\s+)?(?:bows?|arrows?)\s+(?:at\s+)?(?:him|(?:the\s+)?dragon))(?:\s+(?:сейчас|активно|внезапно|сразу|метко|now|actively|suddenly|immediately|accurately))*\s*[.!?]*$/i.test(after);
  const negativeTarget=/(?:не\s+(?:в|по)\s+(?:дракон|него|нему)|not\s+at\s+(?:the\s+)?dragon)/i.test(after);
  const otherTarget=/(?:(?:^|\s)(?:в|по)\s+(?!дракон|него(?:\s|$)|нему(?:\s|$))[а-яёa-z-]{2,}|(?:волк\w*|медвед\w*|мишен\w*|монстр\w*|людей|жителей|wolf|bear|target|people))/i.test(after);
  const priorDragon=/^(?:(?:прилетел\s+)?дракон(?:\s+(?:рядом|здесь|летит|прилетел))*|в\s+небе\s+дракон|(?:the\s+|a\s+)?dragon(?:\s+(?:is\s+)?(?:nearby|here)|\s+(?:flies|arrived))*)\s*$/i.test(priorClause);
  const competingReferent=pronoun&&(
    /(?:волк\w*|медвед\w*|мишен\w*|монстр\w*|wolf|bear|target)/i.test(clauseBefore)||
    (Boolean(priorClause)&&!priorDragon));
  if(humanActor&&!negated&&!negativeTarget&&(explicitDragon||pronoun)&&
     positiveAfter&&!otherTarget&&!competingReferent)
    return{kind:'action',action:'shoot_dragon',text,recognized:true};
  return{kind:'clarification',text,recognized:true,description:
    'Уточни одним предложением, кто стреляет и в кого. Например: «Лучники стреляют в дракона из луков».'};
}
export function classifyStoryText(value,world=null){
  const text=String(value||'').trim().slice(0,600);
  const dragon=/дракон|dragon|огнедышащ|змей горыныч/i.test(text);
  const destructive=rules[0][1].test(text)||
    /разруш|уничтож|снес|разн[её]с|пепел|атаковал|сж[её]г|burn|destroy/i.test(text);
  const benevolent=/подар|помо[гщ]|спас|добр|золото|друж|gift|help/i.test(text);
  if(/^\s*(?:я |мы )?(?:постро|возв[её]л|возвест|созда[тл])/i.test(text))
    return{kind:'build',text,recognized:true};
  // Resolve typed actor -> target before generic dragon routing. Invalid or
  // conflicting archery is a clarification, never a model fallback/event.
  const archery=classifyArchery(text);
  if(archery)return archery;
  if(dragon){
    const kind=destructive?'dragon_fire':benevolent?'dragon_help':'dragon_arrival';
    return{kind,text,recognized:true,medium:dragon};
  }
  for(const [kind,pattern] of actionPatterns){
    if(pattern.test(text))return{kind:'action',action:kind,text,recognized:true};
  }
  // Keep construction requests on the canonical deterministic game engine.
  if(isBuilding.test(text))return{kind:'build',text,recognized:true};
  for(const [kind,pattern] of rules){
    if(pattern.test(text))return{kind,text,recognized:true};
  }
  return{kind:'unknown',text,recognized:false};
}
