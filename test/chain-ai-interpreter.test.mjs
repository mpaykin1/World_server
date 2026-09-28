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
test('Status does not leak API secrets',async()=>{const result=await handleAiInterpret(req({},'GET'),mkEnv());assert.equal(result.status,200);assert.deepEqual((await result.clone().json()).providers,{cloudflare:true,gemini:true});assert.ok(!(await result.text()).includes('TEST_DUMMY'));});
