import test from 'node:test';
import assert from 'node:assert/strict';
import mcp,{config as mcpConfig} from '../netlify/functions/meta-games-mcp.mts';
import health,{config as healthConfig} from '../netlify/functions/meta-games-health.mts';

const version = '2026-07-28';
function request(method, name, args) {
  return new Request('https://example.netlify.app/meta-games/mcp', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      accept:'application/json, text/event-stream',
      'mcp-protocol-version':version,
      'mcp-method':method,
      ...(name ? {'mcp-name':name} : {})
    },
    body:JSON.stringify({
      jsonrpc:'2.0',id:12,method,
      params:{
        _meta:{
          'io.modelcontextprotocol/protocolVersion':version,
          'io.modelcontextprotocol/clientCapabilities':{},
          'io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'}
        },
        ...(name ? {name,arguments:args} : {})
      }
    })
  });
}
test('Netlify handlers use isolated paths', () => {
  assert.equal(mcpConfig.path,'/meta-games/mcp');
  assert.equal(healthConfig.path,'/meta-games/health');
});
test('Netlify health reads real catalog', async () => {
  const r=await health(new Request('https://example.netlify.app/meta-games/health'));
  assert.equal(r.status,200);
  assert.equal((await r.json()).games,4);
});
test('Netlify public MCP lists real game sources', async () => {
  const r=await mcp(request('tools/call','list_games',{}));
  assert.equal(r.status,200);
  const body=await r.json();
  assert.equal(body.result.structuredContent.games.length,4);
});
test('Netlify MCP rejects unknown game instead of inventing', async () => {
  const r=await mcp(request('tools/call','inspect_game',{game_id:'no-such-game'}));
  assert.equal((await r.json()).result.isError,true);
});
