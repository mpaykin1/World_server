// A playable four-card Genie challenge with one free lane. All predictions are
// obtained from the canonical simulator; templates never fabricate resources.
import {engine,LABELS} from './telegram-state.mjs';
import {recordMemory} from './telegram-society.mjs';
const LABEL={power:'энергии',water:'воды',food:'продовольствия'};
const FLAG={
  purpose:/чтобы|ради|цель|хотим|потому|для того|need|because/i,
  mechanism:/благодаря|пут[её]м|за сч[её]т|использ|постро|добы|переработ|преврат|через|using|by /i,
  prerequisites:/сначала|потреб|необходим|нужн|ресурс|специалист|вода|работник|бюджет|договор/i,
  stages:/затем|после|поэтап|этап|срок|через.*дн|постепенно|сначала/i,
  risks:/риск|опасн|если|иначе|авари|побоч|дефицит|ухудш|проблем/i,
  mitigation:/страх|эваку|резерв|очист|контрол|провер|исследован|смягч|запас|эксперт/i
};
const TITLES={
  purpose:'Зачем это нужно?',
  mechanism:'Как именно сооружение поможет?',
  prerequisites:'Откуда возьмутся ресурсы и специалисты?',
  stages:'Что будет сделано сначала, а что позже?',
  risks:'Какие новые дефициты или аварии возможны?',
  mitigation:'Как уменьшить обнаруженный риск?'
};
const copy=w=>structuredClone(w);
export function genieOffer(world){
  const proposal=engine.genieOptions(world),w=copy(world);
  w.coach={stage:'offers',target:proposal.target,
    cards:proposal.cards.map(c=>({id:c.id,structure:c.structure,plan:c.plan,
      forecast:c.forecast})),degraded:proposal.degraded,
    missing:proposal.missingCategories||[],selected:null,draft:null};
  w.revision++;
  return w;
}
export function genieSelect(world,index){
  const current=world.coach;
  if(current?.stage!=='offers'||!current.cards[index])return null;
  const w=copy(world);w.revision++;
  w.coach.stage='explain';w.coach.selected=index;
  return w;
}
function intentFor(world,type,text){
  // A selected card must stay selected, unless a volcanic structure is
  // deliberately repurposed. Do not infer "geothermal" from any use of "power".
  const interpreted=engine.interpretIntent(text,type);
  const volcanic=type==='geothermal'||type==='volcanic_farm';
  let goal=type;
  if(volcanic&&/туризм|экскурс|гостиниц/.test(text.toLowerCase()))goal='tourism';
  if(volcanic&&/теплиц|урожай|почв/.test(text.toLowerCase()))goal='volcanic_farm';
  if(volcanic&&/геотерм|электроэнерг|электростанц/.test(text.toLowerCase()))
    goal='geothermal';
  const spec=engine.PROJECTS[goal];
  const caution=interpreted.assumptions.cautious;
  return {...interpreted,goal,mechanism:goal,resources:structuredClone(spec.needs),
    timeline:spec.build+(caution?1:0),expected:structuredClone(spec.output),
    comment:String(text).slice(0,600)};
}
function compare(world,intent,target){
  const p=engine.preview(world,intent);
  if(!p.feasible)return{plan:p,forecast:null};
  const horizon=p.buildTicks+3;
  const base=engine.simulateTicks(world,horizon);
  const simulated=engine.simulateTicks(engine.commit(world,intent),horizon);
  const delta=Object.fromEntries(['power','water','food','budget','ecology','health']
    .map(key=>[key,simulated.resources[key]-base.resources[key]]));
  const severe=Object.entries(delta).filter(([k,v])=>k!==target&&
    (k==='budget'?v<=-30:v<=-10)).map(([k])=>k);
  return{plan:p,forecast:{target,delta,severe,horizon,
    effect:delta[target]>2?'improves':delta[target]<-2?'worsens':'unchanged'}};
}
export function evaluateExplanation(world,text){
  if(world.coach?.stage!=='explain'&&world.coach?.stage!=='review')return null;
  const w=copy(world),selected=w.coach.cards[w.coach.selected];
  if(!selected)return null;
  const intent=intentFor(world,selected.structure,text);
  const evidence=Object.fromEntries(Object.entries(FLAG)
    .map(([k,p])=>[k,p.test(text)]));
  const missing=Object.keys(evidence).filter(k=>!evidence[k]);
  const simulation=compare(world,intent,w.coach.target);
  w.revision++;
  w.coach.stage='review';
  w.coach.draft={text:String(text).slice(0,600),intent,missing,
    preview:simulation.plan,forecast:simulation.forecast};
  return w;
}
export function critique(world){
  const c=world.coach;
  if(c?.stage!=='review'||!c.draft)return null;
  const d=c.draft,f=d.forecast;
  const gaps=d.missing.slice(0,3).map(k=>'• '+TITLES[k]);
  const required=d.preview.missing.map(x=>x.resource+
    ' '+x.available+'/'+x.required);
  const lines=['🧞 Джинн проверил твою причинную цепочку.',
    'Проект: '+(LABELS[d.intent.goal]||d.intent.goal)+
    '. Стоимость: '+d.preview.cost+'; ожидание: '+d.preview.buildTicks+' дн.' ];
  if(gaps.length)lines.push('Пробелы в объяснении:\n'+gaps.join('\n'));
  if(required.length)lines.push('⛔ Нет ресурсов: '+required.join(', ')+'.');
  if(f){
    const signed=n=>(n>0?'+':'')+n;
    lines.push('Проверка симулятором через '+f.horizon+' дн.: '+
      (LABEL[c.target]||c.target)+' '+signed(f.delta[c.target])+'.');
    const side=Object.entries(f.delta).filter(([k,v])=>k!==c.target&&v!==0)
      .sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,2);
    if(side.length)lines.push('Побочные эффекты: '+side
      .map(([k,v])=>k+' '+signed(v)).join(', ')+'.');
    if(f.severe.length)lines.push('⚠️ Новый серьёзный риск: '+f.severe.join(', ')+'.');
  }
  lines.push('Можешь уточнить текст или подтвердить проект.');
  return lines.join('\n');
}
export function genieCommit(world){
  const c=world.coach;
  if(c?.stage!=='review'||!c.draft||!c.draft.preview.feasible)return null;
  const w=engine.commit(world,c.draft.intent,world.revision);
  const note='Джинн: '+(LABELS[c.draft.intent.goal]||c.draft.intent.goal)+
    '; замысел: '+c.draft.text;
  recordMemory(w,'genie',note);
  w.coach={stage:'done',lastForecast:c.draft.forecast,
    lastGaps:c.draft.missing,lastStructure:c.draft.intent.goal};
  return w;
}
export function genieRetry(world){
  if(!world.coach?.selected&&world.coach?.selected!==0)return null;
  const w=copy(world);w.revision++;
  w.coach.stage='explain';w.coach.draft=null;return w;
}
export function genieCancel(world){
  const w=copy(world);if(w.coach)w.revision++;
  w.coach=null;return w;
}
export function genieDescription(world){
  const c=world.coach;
  if(!c)return'';
  if(c.stage==='offers'){
    const list=c.cards.map((card,i)=>
      '«'+(i+1)+'. '+(LABELS[card.structure]||card.structure)+
      '» 💰'+card.plan.cost+' ⏳'+card.plan.buildTicks).join('\n');
    return'🧞 Дисбаланс: нехватка '+(LABEL[c.target]||c.target)+'.\n'+
      (list||'Пока нет ни одного проверенного варианта.')+
      (c.degraded?'\n⚠️ Симулятор не нашёл честную полную четвёрку.':'')+
      '\nВыбери структуру и напиши, как она поможет.';
  }
  if(c.stage==='explain')return'✍️ Объясни выбранный проект в 1–3 предложениях: '+
    'что он решит, как, какие ресурсы нужны и какой побочный эффект возможен.';
  if(c.stage==='review')return critique(world)||'';
  return'';
}
