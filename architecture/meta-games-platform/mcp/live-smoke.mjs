const endpoint = process.env.META_GAMES_MCP_BASE || 'https://meta-games-mcp-production.onrender.com';
const portal = 'https://mpaykin1.github.io/meta6/meta-games/';
const version = '2026-07-28';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const get = url => fetch(url, { signal: AbortSignal.timeout(25000) });
async function verifyHttp(url, label) {
  const response = await get(url);
  if (!response.ok) throw new Error(label + ' HTTP ' + response.status);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) throw new Error(label + ' unexpected content-type: ' + type);
  const html = await response.text();
  if (!/<html\b/i.test(html)) throw new Error(label + ' missing HTML page');
  console.log('PASS ' + label + ' HTTP ' + response.status + ' (' + html.length + ' bytes)');
}
async function rpc(method, name, args) {
  const params = {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': version,
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'github-https-smoke', version: '1' }
    },
    ...(name ? { name, arguments: args } : {})
  };
  const r = await fetch(endpoint + '/meta-games/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': version,
      'mcp-method': method,
      ...(name ? { 'mcp-name': name } : {})
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 44, method, params }),
    signal: AbortSignal.timeout(30000)
  });
  const json = await r.json();
  if (r.status !== 200 || json.error) throw new Error(method + ' failed: HTTP ' + r.status + ' ' + JSON.stringify(json.error || {}));
  console.log('PASS public HTTPS MCP ' + method + (name ? ' ' + name : '') + ' HTTP ' + r.status);
  return json.result;
}
async function run() {
  let health, last;
  for (let i = 1; i <= 30; i++) {
    try {
      const r = await get(endpoint + '/meta-games/health');
      if ([401,403,404].includes(r.status)) throw Object.assign(new Error('Non-retryable HTTP ' + r.status), { nonRetryable: true });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      health = await r.json();
      if (health.status !== 'ok' || health.games !== 4) throw new Error('Unexpected health JSON');
      break;
    } catch (error) {
      last = error;
      if (error.nonRetryable) throw error;
      if (i === 30) break;
      await pause(10000);
    }
  }
  if (!health) throw new Error('MCP health failed after retries: ' + last);
  console.log('PASS public HTTPS health: ' + JSON.stringify(health));
  const discovered = await rpc('server/discover');
  if (!discovered.supportedVersions?.includes(version)) throw new Error('Missing supported version');
  const listing = await rpc('tools/list');
  const available = listing.tools?.map(t => t.name) || [];
  if (!available.includes('list_games') || !available.includes('inspect_game')) throw new Error('Missing public MCP tools');
  if (process.env.META_GAMES_REQUIRE_LIST_ASSETS === 'true' && !available.includes('list_assets')) throw new Error('list_assets not deployed');
  const games = await rpc('tools/call', 'list_games', {});
  if (games.structuredContent?.games?.length !== 4) throw new Error('Unexpected game inventory');
  const id = games.structuredContent.games[0].id;
  const inspected = await rpc('tools/call', 'inspect_game', { game_id: id });
  if (inspected.structuredContent?.id !== id) throw new Error('Could not inspect a real game');
  if (available.includes('list_assets')) {
    const assets = await rpc('tools/call', 'list_assets', {});
    if (!Array.isArray(assets.structuredContent?.assets) ||
        assets.structuredContent.total !== assets.structuredContent.assets.length ||
        assets.structuredContent.assets.length !== 0) throw new Error('Unlicensed assets leaked');
  }
  if (process.env.META_GAMES_REQUIRE_SEARCH_ASSETS === 'true' && !available.includes('search_assets')) throw new Error('search_assets not deployed');
  if (available.includes('search_assets')) {
    const found = await rpc('tools/call', 'search_assets', {query:'observer',limit:10});
    if (!Array.isArray(found.structuredContent?.assets) || found.structuredContent.total !== 0 ||
        found.structuredContent.assets.length !== 0) throw new Error('Unlicensed assets leaked by search');
  }
  await verifyHttp(portal, 'META GAMES portal');
  for (const [name, relative] of [
    ['Twilight Island', '../observer-world-en-v7/'],
    ['Ashen Path', '../ashen-sumerek/'],
    ['Underwater World', '../underwater-world/'],
    ['Three Worlds', '../three-worlds-game/']
  ]) {
    await verifyHttp(new URL(relative, portal), name);
  }
}
await run();
