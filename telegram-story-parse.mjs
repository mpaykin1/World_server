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
  'extinguish','evacuate','defend','rebuild','relief'
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
export function classifyStoryText(value){
  const text=String(value||'').trim().slice(0,600);
  const dragon=/дракон|dragon|огнедышащ|змей горыныч/i.test(text);
  const destructive=rules[0][1].test(text)||
    /разруш|уничтож|снес|разн[её]с|пепел|атаковал|сж[её]г|burn|destroy/i.test(text);
  const benevolent=/подар|помо[гщ]|спас|добр|золото|друж|gift|help/i.test(text);
  if(/^\s*(?:я |мы )?(?:постро|возв[её]л|возвест|созда[тл])/i.test(text))
    return{kind:'build',text,recognized:true};
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
