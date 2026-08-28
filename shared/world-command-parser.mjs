const TYPE_ALIASES = [
  ['eye', /(глаз|око|\beye\b|\beyeball\b)/i],
  ['beacon', /(огон[её]к|свеч[ауи]|маяк|пламя|\bfire\b|\bflame\b|\bbeacon\b|\bcandle\b)/i],
  ['tower', /(башн[яюи]|\btower\b|\bspire\b)/i],
  ['tree', /(дерев[оаья]|\btree\b)/i],
  ['bridge', /(мост|\bbridge\b)/i],
  ['stairs', /(лестниц[ауые]|ступен|\bstairs\b|\bstaircase\b)/i],
  ['house', /(дом|хижин[ау]|\bhouse\b|\bhome\b|\bhut\b)/i],
  ['portal', /(портал|\bportal\b|\bgate\b)/i],
  ['wall', /(стен[ауые]|\bwall\b)/i],
  ['sphere', /(сфер[ау]|шар|\borb\b|\bsphere\b|\bball\b)/i],
  ['monolith', /(монолит|стел[ау]|\bobelisk\b|\bmonolith\b)/i]
];
const SIZE_ALIASES = [
  ['tiny', /(крошечн|очень маленьк|\btiny\b|\bmini\b)\w*/i, .62],
  ['small', /(маленьк|небольш|\bsmall\b)\w*/i, .8],
  ['huge', /(огромн|гигант|колосс|\bhuge\b|\bgiant\b|\bmassive\b)\w*/i, 1.75],
  ['large', /(больш|крупн|\blarge\b|\bbig\b)\w*/i, 1.3]
];
const COLOR_ALIASES = [
  ['white', /(бел|white)\w*/i], ['black', /(ч[её]рн|black)\w*/i], ['red', /(красн|red)\w*/i],
  ['orange', /(оранж|orange|amber|янтар)\w*/i], ['blue', /(син|голуб|blue)\w*/i], ['green', /(зел[её]н|green)\w*/i],
  ['gold', /(золот|gold)\w*/i], ['gray', /(сер|gray|grey)\w*/i]
];

export function hashText32(text=''){
  let h=2166136261>>>0;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;
}
export function sanitizeWorldCommand(input){
  return String(input??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,320);
}
export function parseWorldCommand(input){
  const text=sanitizeWorldCommand(input);if(!text)throw new Error('Напиши, что должно появиться в мире.');
  const lower=text.toLocaleLowerCase('ru-RU');
  if(/^(отмени|undo|назад)$/i.test(lower))return{action:'undo',text,seed:hashText32(text)};
  if(/^(повтори|redo|верни)$/i.test(lower))return{action:'redo',text,seed:hashText32(text)};
  let type='wish-sculpture';for(const [name,re] of TYPE_ALIASES)if(re.test(lower)){type=name;break;}
  let size='medium',scale=1;for(const [name,re,k] of SIZE_ALIASES)if(re.test(lower)){size=name;scale=k;break;}
  let color=null;for(const [name,re] of COLOR_ALIASES)if(re.test(lower)){color=name;break;}
  const wantsLiteralText=/(надпись|слово|текст|напиши|\bwrite\b|\btext\b|\bword\b)/i.test(lower);
  return {action:'create',type,size,scale,color,text,seed:hashText32(text),literalText:true,wantsLiteralText};
}
