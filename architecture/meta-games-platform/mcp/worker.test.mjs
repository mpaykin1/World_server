import test from 'node:test';
import assert from 'node:assert/strict';
import app from './worker.mjs';
const v='2026-07-28';
function call(method,name,args,override={}){
 const m={'io.modelcontextprotocol/protocolVersion':v,'io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'}};
 const payload={jsonrpc:'2.0',id:1,method,params:{_meta:m,...(name?{name,arguments:args}:{})}};
 return new Request('https://test.example/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':v,'mcp-method':method,...(name?{'mcp-name':name}:{}),...override},body:JSON.stringify(payload)});
}
test('health',async()=>{const r=await app.fetch(new Request('https://test.example/health'));assert.equal(r.status,200);assert.equal((await r.json()).games,4);});
test('discovery',async()=>{const b=await(await app.fetch(call('server/discover'))).json();assert.deepEqual(b.result.supportedVersions,[v]);assert.equal(b.result.resultType,'complete');});
test('list tools',async()=>{const b=await(await app.fetch(call('tools/list'))).json();assert.deepEqual(b.result.tools.map(t=>t.name),['list_games','inspect_game']);});
test('list real games',async()=>{const b=await(await app.fetch(call('tools/call','list_games',{}))).json();assert.equal(b.result.structuredContent.games.length,4);assert.match(b.result.structuredContent.games[0].entry.git_blob_sha,/^[a-f0-9]{40}$/);});
test('known and unknown game',async()=>{const a=await(await app.fetch(call('tools/call','inspect_game',{game_id:'ashen'}))).json();assert.equal(a.result.structuredContent.id,'ashen');const b=await(await app.fetch(call('tools/call','inspect_game',{game_id:'absent'}))).json();assert.equal(b.result.isError,true);});
test('CORS reject',async()=>{const r=await app.fetch(call('tools/list',null,null,{origin:'https://evil.example'}));assert.equal(r.status,403);});
test('version and method header reject',async()=>{assert.equal((await app.fetch(call('tools/list',null,null,{'mcp-protocol-version':'2025-11-25'}))).status,400);assert.equal((await app.fetch(call('tools/list',null,null,{'mcp-method':'tools/call'}))).status,400);});
test('reject oversized input',async()=>{const r=await app.fetch(new Request('https://test.example/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:'a'.repeat(17000)}));assert.equal(r.status,413);});
