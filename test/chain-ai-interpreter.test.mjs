import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAiInterpret } from '../chain-ai-interpreter.mjs';
const parsed = JSON.stringify({summary:'Создать готический город',commands:[{action:'create',kind:'city',style:'gothic',details:'Собор и дома'}],unknowns:[]});
const origin = 'https://mpaykin1.github.io';
const mkEnv = () => ({ AI: { run: async () => ({ response: parsed }) }, GEMINI_API_KEY:'TEST_DUMMY_NEVER_REAL',
  OPENROUTER_API_KEY:'TEST_DUMMY_OPENROUTER_NEVER_REAL',
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
test('OpenRouter uses only the free router and keeps its key server-side', async () => {
 const oldFetch=globalThis.fetch;let checked=false;
 globalThis.fetch=async (url,opts)=>{
   const body=JSON.parse(opts.body);
   checked=url==='https://openrouter.ai/api/v1/chat/completions'
      && opts.headers.authorization==='Bearer TEST_DUMMY_OPENROUTER_NEVER_REAL'
      && body.model==='openrouter/free' && body.messages[1].role==='user';
   return Response.json({choices:[{message:{content:parsed}}]});
 };
 try{const result=await handleAiInterpret(req({text:'Построй город',provider:'openrouter',
   model:'openai/paid-model-must-be-ignored'}),mkEnv());
   assert.equal(result.status,200);assert.equal((await result.json()).provider,'openrouter');assert.ok(checked);
 }finally{globalThis.fetch=oldFetch;}
});
test('Auto falls back to OpenRouter after Workers AI failure', async () => {
 const oldFetch=globalThis.fetch;let routed=false;
 globalThis.fetch=async url=>{routed=String(url).includes('openrouter.ai');return Response.json({choices:[{message:{content:parsed}}]});};
 try{const env=mkEnv();env.AI.run=async()=>{throw Error('unavailable');};
 const result=await handleAiInterpret(req({text:'Построй город',provider:'auto'}),env);
 assert.equal(result.status,200);assert.equal((await result.json()).provider,'openrouter');assert.ok(routed);
 }finally{globalThis.fetch=oldFetch;}
});
test('Auto falls back to Gemini after OpenRouter rate limit', async () => {
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('openrouter.ai')
    ? Response.json({error:'free_quota'}, {status:429})
    : Response.json({candidates:[{content:{parts:[{text:parsed}]}}]});
 try{const env=mkEnv();env.AI.run=async()=>{throw Error('unavailable');};
 const result=await handleAiInterpret(req({text:'Построй город',provider:'auto'}),env);
 assert.equal(result.status,200);assert.equal((await result.json()).provider,'gemini');
 }finally{globalThis.fetch=oldFetch;}
});
test('Explicit OpenRouter without key fails closed',async()=>{
 const env=mkEnv();delete env.OPENROUTER_API_KEY;
 const result=await handleAiInterpret(req({text:'Построй город',provider:'openrouter'}),env);
 assert.equal(result.status,503);assert.equal((await result.json()).detail,'OPENROUTER_KEY_MISSING');
});
test('Auto falls back to Gemini on Workers AI failure', async () => {
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:parsed}]}}]});
 try{const env=mkEnv();delete env.OPENROUTER_API_KEY;env.AI.run=async()=>{throw Error('unavailable');};
 const result=await handleAiInterpret(req({text:'Построй город',provider:'auto'}),env);
 assert.equal((await result.json()).provider,'gemini');}finally{globalThis.fetch=oldFetch;}
});
test('Reject foreign origins',async()=>{const result=await handleAiInterpret(req({text:'Город'},'POST',{origin:'https://attacker.example'}),mkEnv());assert.equal(result.status,403);});
test('Refuse to call AI without cost guard',async()=>{const env=mkEnv();delete env.GAME_AI_RATE_LIMIT;const result=await handleAiInterpret(req({text:'Город'}),env);assert.equal(result.status,503);});
test('Apply request rate limit',async()=>{const env=mkEnv();env.GAME_AI_RATE_LIMIT.limit=async()=>({success:false});const result=await handleAiInterpret(req({text:'Город'}),env);assert.equal(result.status,429);});
test('Reject invalid prompt',async()=>{const result=await handleAiInterpret(req({text:'а'}),mkEnv());assert.equal(result.status,400);});
test('Accept official game CORS preflight',async()=>{const result=await handleAiInterpret(req({},'OPTIONS'),mkEnv());assert.equal(result.status,204);assert.equal(result.headers.get('access-control-allow-origin'),origin);});
test('Status does not leak API secrets',async()=>{const result=await handleAiInterpret(req({},'GET'),mkEnv());assert.equal(result.status,200);assert.deepEqual((await result.clone().json()).providers,{cloudflare:true,gemini:true,openrouter:true});assert.ok(!(await result.text()).includes('TEST_DUMMY'));});

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
