import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from './render-server.mjs';

let server, base;
before(async () => {
  server = createMcpServer({ publicOrigin: 'https://meta-games-test.onrender.com', revision: 'a'.repeat(40) });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
});
const version = '2026-07-28';
async function rpc(method, name, args) {
  const params = {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': version,
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'render-integration', version: '1' }
    },
    ...(name ? { name, arguments: args } : {})
  };
  const res = await fetch(base + '/meta-games/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': version,
      'mcp-method': method,
      ...(name ? { 'mcp-name': name } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 3, method, params })
  });
  return { status: res.status, body: await res.json() };
}
test('health endpoint reports exactly the pinned catalog', async () => {
  const res = await fetch(base + '/meta-games/health');
  assert.equal(res.status, 200);
  const health=await res.json();
  assert.equal(health.games, 5);
  assert.equal(health.licensed_assets, 6);
  assert.equal(health.source_sha, 'a'.repeat(40));
});
test('MCP discovery, tools, game listing, and game inspection', async () => {
  const discover = await rpc('server/discover');
  assert.equal(discover.status, 200);
  assert.deepEqual(discover.body.result.supportedVersions, [version]);
  const list = await rpc('tools/list');
  assert.deepEqual(list.body.result.tools.map(x => x.name), ['list_games', 'inspect_game', 'list_assets', 'search_assets', 'search_mechanics', 'get_asset', 'get_source', 'combine_assets', 'create_game', 'validate_game', 'preview_game', 'get_dependencies']);
  const games = await rpc('tools/call', 'list_games', {});
  assert.equal(games.body.result.structuredContent.games.length, 5);
  const assets = await rpc('tools/call', 'list_assets', {});
  assert.equal(assets.body.result.structuredContent.total, 6);
  assert.deepEqual(assets.body.result.structuredContent.assets.map(a=>a.id).sort(),['observer-audio','observer-mobile-input','observer-story','three-worlds-combat-facing','three-worlds-rift-guard','three-worlds-weather-cycle']);
  const search = await rpc('tools/call', 'search_assets', {query:'observer'});
  assert.equal(search.body.result.structuredContent.total, 3);
  const gameId = games.body.result.structuredContent.games[0].id;
  const inspected = await rpc('tools/call', 'inspect_game', {game_id: gameId});
  assert.equal(inspected.body.result.structuredContent.id, gameId);
});
test('untrusted Origin and arbitrary paths are rejected', async () => {
  const forbidden = await fetch(base + '/meta-games/health', {headers:{origin:'https://untrusted.example'}});
  assert.equal(forbidden.status,403);
  const missing = await fetch(base + '/admin');
  assert.equal(missing.status,404);
});
