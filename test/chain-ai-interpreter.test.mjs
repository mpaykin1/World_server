import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAiInterpret } from '../chain-ai-interpreter.mjs';
const parsed = JSON.stringify({summary:'Создать готический город',commands:[{action:'create',kind:'city',style:'gothic',details:'Собор и дома'}],unknowns:[]});
const origin = 'https://mpaykin1.github.io';
const mkEnv = () => ({ AI: { run: async () => ({ response: parsed }) }, GEMINI_API_KEY:'TEST_DUMMY_NEVER_REAL',
  GAME_AI_RATE_LIMIT: { limit: async () => ({ success:true }) } });
const req = (input, method='POST', headers={}) => new Request('https://world.example/api/chain-ai', {
  method, headers: { origin, 'content-type':'application/json', ...headers }, ...(method==='POST'?{body:JSON.stringify(input)}:{}) });

test('Cloudflare interprets gothic-city prompt without claiming execution', async () => {
 const result=await handleAiInterpret(req({text:'Построй готический город',provider:'cloudflare'}),mkEnv());
 const body=await result.json();assert.equal(result.status,200);assert.equal(body.proposal.commands[0].style,'gothic');assert.equal(body.executed,false);
});
test('Gemini interprets with API key kept server-side', async () => {
 const oldFetch=globalThis.fetch;let auth=false;
 globalThis.fetch=async (_,opts)=>{auth=opts.headers['x-goog-api-key']==='TEST_DUMMY_NEVER_REAL';return Response.json({candidates:[{content:{parts:[{text:parsed}]}}]});};
 try{const result=await handleAiInterpret(req({text:'Построй готический город',provider:'gemini'}),mkEnv());assert.equal(result.status,200);assert.equal((await result.json()).provider,'gemini');assert.ok(auth);}finally{globalThis.fetch=oldFetch;}
});
test('Auto falls back to Gemini on Workers AI failure', async () => {
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:parsed}]}}]});
 try{const env=mkEnv();env.AI.run=async()=>{throw Error('unavailable');};
 const result=await handleAiInterpret(req({text:'Построй город',provider:'auto'}),env);
 assert.equal((await result.json()).provider,'gemini');}finally{globalThis.fetch=oldFetch;}
});
test('Reject foreign origins',async()=>{const result=await handleAiInterpret(req({text:'Город'},'POST',{origin:'https://attacker.example'}),mkEnv());assert.equal(result.status,403);});
test('Refuse to call AI without cost guard',async()=>{const env=mkEnv();delete env.GAME_AI_RATE_LIMIT;const result=await handleAiInterpret(req({text:'Город'}),env);assert.equal(result.status,503);});
test('Apply request rate limit',async()=>{const env=mkEnv();env.GAME_AI_RATE_LIMIT.limit=async()=>({success:false});const result=await handleAiInterpret(req({text:'Город'}),env);assert.equal(result.status,429);});
test('Reject invalid prompt',async()=>{const result=await handleAiInterpret(req({text:'а'}),mkEnv());assert.equal(result.status,400);});
test('Accept official game CORS preflight',async()=>{const result=await handleAiInterpret(req({},'OPTIONS'),mkEnv());assert.equal(result.status,204);assert.equal(result.headers.get('access-control-allow-origin'),origin);});
test('Status does not leak API secrets',async()=>{const result=await handleAiInterpret(req({},'GET'),mkEnv());assert.equal(result.status,200);assert.deepEqual((await result.clone().json()).providers,{cloudflare:true,gemini:true,groq:false});assert.ok(!(await result.text()).includes('TEST_DUMMY'));});

test('Gemini retries only allowlisted free model if first returns 404', async () => {
 const oldFetch=globalThis.fetch, seen=[];
 globalThis.fetch=async (url)=>{
   seen.push(url);
   return url.includes('3.5-flash-lite')
    ? new Response('{}',{status:404})
    : Response.json({candidates:[{content:{parts:[{text:parsed}]}}]});
 };
 try {
   const response=await handleAiInterpret(req({text:'Построй город',provider:'gemini'}),mkEnv());
   assert.equal(response.status,200);
   assert.equal(seen.length,2);
   assert.match(seen[0],/gemini-3\.5-flash-lite/);
   assert.match(seen[1],/gemini-3\.1-flash-lite/);
 } finally {globalThis.fetch=oldFetch;}
});
test('Gemini refuses model outside known free-model list', async () => {
 const env=mkEnv();env.GEMINI_MODEL='paid-model';
 const response=await handleAiInterpret(req({text:'Построй город',provider:'gemini'}),env);
 assert.equal(response.status,503);
 const body=await response.json();
 assert.equal(body.detail,'GEMINI_MODEL_NOT_FREE_ALLOWLISTED');
});

test('Dragon arrival is preserved as a supported event command', async () => {
 const env=mkEnv();
 env.AI.run=async()=>({response:JSON.stringify({summary:'Прилетел дракон',commands:[{action:'event',kind:'dragon',details:'Дракон прилетел'}],unknowns:[]})});
 const response=await handleAiInterpret(req({text:'Прилетел дракон',provider:'cloudflare',worldContext:{turn:0,entities:[]}}),env);
 const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.proposal.commands[0].action,'event');assert.equal(body.proposal.commands[0].kind,'dragon');
});
test('Living dragon context reaches the model without arbitrary entity data', async () => {
 let seen='';
 const env=mkEnv();
 env.AI.run=async (_model,input)=>{seen=input.messages[1].content;return {response:JSON.stringify({summary:'Атака',commands:[{action:'event',kind:'attack'}],unknowns:[]})};};
 const response=await handleAiInterpret(req({text:'Люди в него стреляют',provider:'cloudflare',worldContext:{
   turn:2,entities:[{kind:'dragon',hp:73,secret:'do-not-pass'},{kind:'person',hp:10}]
 }}),env);
 assert.equal(response.status,200);assert.match(seen,/"entities":\[\{"kind":"dragon","hp":73\}\]/);assert.doesNotMatch(seen,/secret|person/);
});


test('Build prediction uses current world context without advancing the world', async () => {
  let systemPrompt='', userMessage='';
  const env=mkEnv();
  env.AI.run=async (_model,input)=>{
    systemPrompt=input.messages[0].content;
    userMessage=input.messages[1].content;
    return {response:JSON.stringify({
      summary:'Город, вероятно, усилит спрос на ресурсы.',
      immediate:['Появится дополнительный спрос на воду и энергию.'],
      later:['Может вырасти потребность в инфраструктуре.'],
      risks:['При низких запасах воды возможен дефицит.'],
      surprise:'Рост города может повысить ценность соседнего леса как зоны отдыха.',
      confidence:0.72
    })};
  };
  const input={text:'Построить город',mode:'predict_build',provider:'cloudflare',
    build:{kind:'city',location:'текущее место в сцене'},
    worldContext:{turn:4,population:43,power:12,water:6,food:9,eco:24,budget:38,placed:{city:1,forest:2,energy:0,volcano:0}}};
  const response=await handleAiInterpret(req(input),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.executed,false);
  assert.equal(body.provider,'cloudflare');
  assert.match(body.prediction.summary,/Город/);
  assert.deepEqual(body.prediction.risks,['При низких запасах воды возможен дефицит.']);
  assert.equal(body.prediction.confidence,0.72);
  assert.match(systemPrompt,/Do NOT advance turns/);
  assert.match(userMessage,/"turn":4/);
  assert.match(userMessage,/"water":6/);
  assert.match(userMessage,/"kind":"city"/);
});

test('Build prediction rejects unsupported build kinds before calling AI', async () => {
  const env=mkEnv(); let called=false;
  env.AI.run=async()=>{called=true;return {response:'{}'};};
  const response=await handleAiInterpret(req({
    text:'Построить космопорт',mode:'predict_build',provider:'cloudflare',
    build:{kind:'spaceport'},worldContext:{turn:0}
  }),env);
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'invalid_build_kind');
  assert.equal(called,false);
});

test('Prediction strips untrusted extra world fields', async () => {
  let seen='';
  const env=mkEnv();
  env.AI.run=async (_model,input)=>{
    seen=input.messages[1].content;
    return {response:JSON.stringify({
      summary:'Лес может улучшить экологическую устойчивость.',
      immediate:['Вероятно улучшится состояние экологии.'],later:[],risks:[],surprise:'',confidence:0.6
    })};
  };
  const response=await handleAiInterpret(req({
    text:'Посадить лес',mode:'predict_build',provider:'cloudflare',build:{kind:'forest'},
    worldContext:{turn:1,eco:3,secret:'never-pass',placed:{forest:0,secret:99}}
  }),env);
  assert.equal(response.status,200);
  assert.doesNotMatch(seen,/secret|never-pass/);
});


test('Exact future numbers are converted to qualitative grounded language', async () => {
  const originalFetch=globalThis.fetch;
  const env=mkEnv();
  env.AI.run=async()=>({response:JSON.stringify({
    summary:'Город может вырасти.',immediate:['Население вырастет на 12 человек.'],
    later:[],risks:[],surprise:'',confidence:0.7
  })});
  globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
    summary:'Город, вероятно, усилит спрос на ресурсы.',
    immediate:['Может вырасти нагрузка на воду и энергию.'],
    later:['Возможно, потребуется дополнительная инфраструктура.'],
    risks:['Существующий дефицит воды может усилиться.'],
    surprise:'Рост города может изменить ценность уже построенных объектов.',
    confidence:0.68
  })}]}}]});
  try{
    const response=await handleAiInterpret(req({
      text:'Построить город',mode:'predict_build',provider:'auto',
      build:{kind:'city'},worldContext:{turn:2,water:6,power:12,budget:38}
    }),env);
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.provider,'cloudflare');
    assert.doesNotMatch(JSON.stringify(body.prediction),/12 человек/);
    assert.match(JSON.stringify(body.prediction),/населения/);
  }finally{globalThis.fetch=originalFetch;}
});

test('Explicit prediction provider fails closed on ungrounded invented facts', async () => {
  const env=mkEnv();
  env.AI.run=async()=>({response:JSON.stringify({
    summary:'Город может развиваться.',
    immediate:['Может открыться скрытый ресурс.'],later:[],risks:[],surprise:'',confidence:0.7
  })});
  const response=await handleAiInterpret(req({
    text:'Построить город',mode:'predict_build',provider:'cloudflare',
    build:{kind:'city'},worldContext:{turn:0}
  }),env);
  assert.equal(response.status,503);
  assert.match((await response.json()).detail,/AI_PREDICTION_EMPTY/);
});


test('Glyph action prediction supports the Meta5 action catalog without mutating the world', async () => {
  let systemPrompt='', userMessage='';
  const env=mkEnv();
  env.AI.run=async (_model,input)=>{
    systemPrompt=input.messages[0].content;
    userMessage=input.messages[1].content;
    return {response:JSON.stringify({
      summary:'Река, вероятно, изменит маршруты людей и доступность воды.',
      immediate:['Может улучшиться доступ к воде в видимой области.'],
      later:['Поселения могут начать тянуться к берегу.'],
      risks:['Соседние участки могут стать менее удобными для строительства.'],
      surprise:'Река может связать ранее раздельные части мира.',
      confidence:0.71
    })};
  };
  const response=await handleAiInterpret(req({
    text:'Предсказать действие Река',
    mode:'predict_action',
    provider:'cloudflare',
    action:{kind:'river',name:'Река',glyph:'川',location:'видимая область x 120 y -40'},
    worldContext:{
      turn:5,population:31,power:18,water:20,food:36,eco:47,budget:42,
      visible:{city:1,forest:2,river:0,secret:99}
    }
  }),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.executed,false);
  assert.equal(body.provider,'cloudflare');
  assert.match(body.prediction.summary,/Река/);
  assert.match(systemPrompt,/glyph-world game/);
  assert.match(userMessage,/"kind":"river"/);
  assert.match(userMessage,/"glyph":"川"/);
  assert.match(userMessage,/"visible":\{"city":1,"forest":2,"river":0\}/);
  assert.doesNotMatch(userMessage,/secret/);
});

test('Glyph action prediction rejects actions outside the server allowlist before calling AI', async () => {
  const env=mkEnv(); let called=false;
  env.AI.run=async()=>{called=true;return {response:'{}'};};
  const response=await handleAiInterpret(req({
    text:'Предсказать действие',
    mode:'predict_action',
    provider:'cloudflare',
    action:{kind:'spaceport',name:'Космопорт',glyph:'星'},
    worldContext:{turn:0}
  }),env);
  assert.equal(response.status,400);
  assert.equal((await response.json()).error,'invalid_action_kind');
  assert.equal(called,false);
});


test('Glyph action prediction can return English without changing the Russian default', async () => {
  let systemPrompt='', userMessage='';
  const env=mkEnv();
  env.AI.run=async (_model,input)=>{
    systemPrompt=input.messages[0].content;
    userMessage=input.messages[1].content;
    return {response:JSON.stringify({
      summary:'A forest may improve local ecology while creating new resource flows toward the city.',
      immediate:['Residents may begin using the forest as a nearby resource and recreation area.'],
      later:['Paths and exchange between the forest and nearby settlement could become more active.'],
      risks:['Heavy use could put pressure on the forest edge.'],
      surprise:'The forest could become a focal point for a new route or neighborhood.',
      confidence:0.78
    })};
  };
  const response=await handleAiInterpret(req({
    text:'Predict the Forest action',
    mode:'predict_action',
    language:'en',
    provider:'cloudflare',
    action:{kind:'forest',name:'Forest',glyph:'木',location:'visible area x 40 y 20'},
    worldContext:{turn:3,population:22,power:11,water:30,food:27,eco:44,budget:38,visible:{city:1,forest:0}}
  }),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.executed,false);
  assert.equal(body.language,'en');
  assert.match(body.prediction.summary,/forest/i);
  assert.match(systemPrompt,/All natural-language strings must be in English/);
  assert.match(userMessage,/"name":"Forest"/);
});

test('Glyph action prediction keeps Russian as the default language', async () => {
  const env=mkEnv();
  env.AI.run=async (_model,input)=>{
    assert.match(input.messages[0].content,/All natural-language strings must be in Russian/);
    return {response:JSON.stringify({
      summary:'Лес, вероятно, улучшит экологию видимой области.',
      immediate:['Жители могут чаще использовать лес.'],
      later:['Может появиться новая связь с поселением.'],
      risks:['Чрезмерное использование может ослабить край леса.'],
      surprise:'Лес может стать причиной нового маршрута.',
      confidence:0.66
    })};
  };
  const response=await handleAiInterpret(req({
    text:'Предсказать Лес',
    mode:'predict_action',
    provider:'cloudflare',
    action:{kind:'forest',name:'Лес',glyph:'木',location:'видимая область'},
    worldContext:{turn:1}
  }),env);
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.language,'ru');
  assert.match(body.prediction.summary,/Лес/);
});
