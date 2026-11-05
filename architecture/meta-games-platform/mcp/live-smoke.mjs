import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../ASSET_INDEX.json', import.meta.url), 'utf8'));
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
      if (health.status !== 'ok' || !Number.isSafeInteger(health.games) || health.games < 1) throw new Error('Unexpected health JSON');
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
  const catalogIsDeployed = !process.env.GITHUB_SHA || health.source_sha === process.env.GITHUB_SHA;
  if (!catalogIsDeployed) console.log('PREDEPLOY: checking existing public inventory; candidate catalog is NOT confirmed until exact-SHA Render CD');
  const discovered = await rpc('server/discover');
  if (!discovered.supportedVersions?.includes(version)) throw new Error('Missing supported version');
  const listing = await rpc('tools/list');
  const available = listing.tools?.map(t => t.name) || [];
  if (!available.includes('list_games') || !available.includes('inspect_game')) throw new Error('Missing public MCP tools');
  if (process.env.META_GAMES_REQUIRE_LIST_ASSETS === 'true' && !available.includes('list_assets')) throw new Error('list_assets not deployed');
  const games = await rpc('tools/call', 'list_games', {});
  if (games.structuredContent?.games?.length !== health.games) throw new Error('Unexpected game inventory');
  const expectedIds = catalog.games.map(game => game.id).sort();
  const actualIds = games.structuredContent.games.map(game => game.id).sort();
  if (catalogIsDeployed && JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) throw new Error('Public game IDs differ from pinned catalog');
  const id = games.structuredContent.games[0].id;
  if (catalogIsDeployed) {
    const veil = await rpc('tools/call', 'inspect_game', { game_id: 'veil-terraces' });
    const veilEntry = catalog.games.find(game => game.id === 'veil-terraces');
    if (!veilEntry || veil.structuredContent?.entry?.git_blob_sha !== veilEntry.entry.git_blob_sha) throw new Error('Published Veil entry not pinned');
  }
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
  // Strict release gate: eight live HTTPS tools, with zero unlicensed source disclosure.
  if (process.env.META_GAMES_REQUIRE_PINNED_READS === 'true' ||
      available.includes('get_asset') || available.includes('get_source') ||
      (health.source_sha && health.source_sha === process.env.GITHUB_SHA)) {
    const expected = [
      'list_games', 'inspect_game', 'list_assets', 'search_assets',
      'search_mechanics', 'get_asset', 'get_source', 'get_dependencies'
    ];
    if (JSON.stringify(available) !== JSON.stringify(expected))
      throw new Error('Public Render must expose exactly eight pinned MCP tools: ' + JSON.stringify(available));
    const index = JSON.parse(readFileSync(new URL('../ASSET_INDEX.json', import.meta.url), 'utf8'));
    const candidateIds = index.review_candidates.map(a => a.id);
    if (candidateIds.length !== 6 || new Set(candidateIds).size !== 6)
      throw new Error('The license-denial smoke fixture no longer contains six unique candidates');
    for (const name of ['get_asset', 'get_source']) {
      for (const asset_id of candidateIds) {
        const result = await rpc('tools/call', name, { asset_id });
        if (!result.isError || result.structuredContent?.error !== 'Asset unavailable for reuse')
          throw new Error(name + ' exposed unlicensed candidate: ' + asset_id);
      }
      const unknown = await rpc('tools/call', name, { asset_id: 'unknown-reuse-candidate' });
      if (!unknown.isError || unknown.structuredContent?.error !== 'Asset unavailable for reuse')
        throw new Error(name + ' does not reject unknown asset IDs');
    }
    console.log('PASS eight live public MCP tools; all six unaudited candidates denied by get_asset/get_source');
  }
  await verifyHttp(portal, 'META GAMES portal');
  for (const [name, relative] of [
    ['Twilight Island', '../observer-world-en-v7/'],
    ['Ashen Path', '../ashen-sumerek/'],
    ['Underwater World', '../underwater-world/'],
    ['Three Worlds', '../three-worlds-game/'],
    ['Veil Terraces', '../meta-games-worlds/veil-terraces/']
  ]) {
    await verifyHttp(new URL(relative, portal), name);
  }
}
await run();
