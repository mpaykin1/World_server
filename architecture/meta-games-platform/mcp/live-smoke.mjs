import { execFileSync } from 'node:child_process';
import { expectedDeployedSha } from './expected-sha.mjs';
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
  const checkoutHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // Pull requests verify the already-published master catalog, not their
  // unpublished candidate; merged master must pass against its exact live SHA.
  const expectedRef = process.env.META_GAMES_EXPECTED_REF || 'HEAD';
  const expectedSha = expectedDeployedSha(expectedRef);
  const publishedIndex = JSON.parse(execFileSync('git', [
    'show', expectedRef + ':architecture/meta-games-platform/ASSET_INDEX.json'
  ], { encoding: 'utf8', maxBuffer: 1 << 20 }));
  const expectedGameIds = publishedIndex.games.map(g => g.id);
  const expectedAssets = publishedIndex.reusable_assets;
  const approvedIds = expectedAssets.map(a => a.id).sort();
  const deniedIds = publishedIndex.review_candidates.map(a => a.id);
  if (new Set(expectedGameIds).size !== expectedGameIds.length ||
      new Set(approvedIds).size !== approvedIds.length ||
      new Set(deniedIds).size !== deniedIds.length ||
      deniedIds.some(id => approvedIds.includes(id)))
    throw new Error('Expected release manifest contains duplicate or overlapping IDs');
  console.log('MCP SHA provenance: checkout HEAD=' + checkoutHead +
    ', last MCP-relevant commit=' + expectedSha);
  let health, last;
  for (let i = 1; i <= 30; i++) {
    try {
      const r = await get(endpoint + '/meta-games/health');
      if ([401,403,404].includes(r.status)) throw Object.assign(new Error('Non-retryable HTTP ' + r.status), { nonRetryable: true });
      if (r.status !== 200) throw new Error('HTTP ' + r.status);
      const observed = await r.json();
      if (observed.status !== 'ok' || observed.games !== expectedGameIds.length ||
          observed.licensed_assets !== approvedIds.length)
        throw new Error('Public health differs from exact expected-ref catalog: ' +
          JSON.stringify({ expectedRef, games: expectedGameIds.length,
            licensed_assets: approvedIds.length, observed }));
      if (observed.source_sha !== expectedSha) throw new Error(
        'Render source_sha ' + observed.source_sha + ' does not match last master MCP change ' + expectedSha);
      health = observed;
      break;
    } catch (error) {
      last = error;
      if (error.nonRetryable) throw error;
      if (i === 30) break;
      await pause(10000);
    }
  }
  if (!health) throw new Error('MCP health did not serve expected SHA after retries: ' + last);
  console.log('PASS public HTTPS health: ' + JSON.stringify(health));
  const discovered = await rpc('server/discover');
  if (!discovered.supportedVersions?.includes(version)) throw new Error('Missing supported version');
  const listing = await rpc('tools/list');
  const available = listing.tools?.map(t => t.name) || [];
  if (!available.includes('list_games') || !available.includes('inspect_game')) throw new Error('Missing public MCP tools');
  if (process.env.META_GAMES_REQUIRE_LIST_ASSETS === 'true' && !available.includes('list_assets')) throw new Error('list_assets not deployed');
  const games = await rpc('tools/call', 'list_games', {});
  if (!Array.isArray(games.structuredContent?.games)) throw new Error('Missing public game inventory');
  const gameIds = games.structuredContent.games.map(game => game.id);
  if (JSON.stringify([...gameIds].sort()) !== JSON.stringify([...expectedGameIds].sort()))
    throw new Error('Public game IDs mismatch expected-ref catalog: ' +
      JSON.stringify({expected:expectedGameIds,actual:gameIds}));
  if (expectedGameIds.includes('veil-terraces') && !gameIds.includes('veil-terraces'))
    throw new Error('Public MCP is missing Veil Terraces');
  console.log('LIVE public MCP list_games exact IDs: ' + JSON.stringify(gameIds));
  const id = games.structuredContent.games[0].id;
  const inspected = await rpc('tools/call', 'inspect_game', { game_id: id });
  if (inspected.structuredContent?.id !== id) throw new Error('Could not inspect a real game');
  if (available.includes('list_assets')) {
    const assets = await rpc('tools/call', 'list_assets', {});
    if (!Array.isArray(assets.structuredContent?.assets) ||
        assets.structuredContent.total !== assets.structuredContent.assets.length ||
        JSON.stringify(assets.structuredContent.assets.map(a => a.id).sort()) !== JSON.stringify(approvedIds))
      throw new Error('Public reusable assets differ from rights-audited expected-ref catalog');
  }
  if (process.env.META_GAMES_REQUIRE_SEARCH_ASSETS === 'true' && !available.includes('search_assets')) throw new Error('search_assets not deployed');
  if (available.includes('search_assets')) {
    const found = await rpc('tools/call', 'search_assets', {query:'observer',limit:10});
    const expectedFoundIds = approvedIds.filter(id => id.includes('observer'));
    if (!Array.isArray(found.structuredContent?.assets) || found.structuredContent.total !== expectedFoundIds.length ||
        JSON.stringify(found.structuredContent.assets.map(a => a.id).sort()) !== JSON.stringify(expectedFoundIds))
      throw new Error('Public asset search differs from expected-ref rights catalog');
  }
  // Strict release gate: twelve exact live HTTPS tools, only reviewed source and exact denials.
  if (process.env.META_GAMES_REQUIRE_PINNED_READS === 'true' ||
      available.includes('get_asset') || available.includes('get_source') ||
      (health.source_sha && health.source_sha === process.env.GITHUB_SHA)) {
    const expected = [
      'list_games', 'inspect_game', 'list_assets', 'search_assets',
      'search_mechanics', 'get_asset', 'get_source',
      'combine_assets', 'create_game', 'validate_game', 'preview_game', 'get_dependencies'
    ];
    if (JSON.stringify(available) !== JSON.stringify(expected))
      throw new Error('Public Render must expose exactly twelve pinned MCP tools: ' + JSON.stringify(available));
    const mechanics = await rpc('tools/call', 'search_mechanics', { query: 'observer', limit: 10 });
    if (mechanics.isError || !Array.isArray(mechanics.structuredContent?.mechanics) ||
        mechanics.structuredContent.total !== 0 || mechanics.structuredContent.mechanics.length !== 0)
      throw new Error('Unlicensed mechanics leaked by search_mechanics');
    // On PRs check *published master* for exact positives, but include independently
    // SHA-pinned unverified sources from the proposed catalog as additional negative
    // candidates. This keeps the strict >=3 real-denial invariant even when master
    // has fewer candidates than the staged catalog. No licensing is inferred.
    const staged = JSON.parse(execFileSync('git', [
      'show', 'HEAD:architecture/meta-games-platform/ASSET_INDEX.json'
    ], { encoding: 'utf8', maxBuffer: 1 << 20 }));
    const stagedDenied = staged.review_candidates.map(a => a.id);
    if (new Set(stagedDenied).size !== stagedDenied.length ||
        stagedDenied.some(id => staged.reusable_assets.some(a => a.id === id)))
      throw new Error('Staged source manifest contains overlapping license IDs');
    const candidateIds = [...new Set([...deniedIds, ...stagedDenied])];
    if (candidateIds.length < 3 || new Set(candidateIds).size !== candidateIds.length)
      throw new Error('Expected-ref license denial fixture is unexpectedly incomplete');
    for (const name of ['get_asset', 'get_source', 'get_dependencies']) {
      for (const asset_id of candidateIds) {
        const result = await rpc('tools/call', name, { asset_id });
        if (!result.isError || result.structuredContent?.error !== 'Asset unavailable for reuse')
          throw new Error(name + ' exposed unlicensed candidate: ' + asset_id);
      }
      const unknown = await rpc('tools/call', name, { asset_id: 'unknown-reuse-candidate' });
      if (!unknown.isError || unknown.structuredContent?.error !== 'Asset unavailable for reuse')
        throw new Error(name + ' does not reject unknown asset IDs');
    }
    for (const asset_id of approvedIds) {
      const source = await rpc('tools/call', 'get_source', { asset_id });
      if (source.isError || source.structuredContent?.encoding !== 'utf-8' ||
          !source.structuredContent.content || source.structuredContent.asset_id !== asset_id)
        throw new Error('Approved source is not retrievable: ' + asset_id);
      const bytes = await rpc('tools/call','get_asset',{ asset_id });
      if (bytes.isError || bytes.structuredContent?.encoding !== 'base64' ||
          bytes.structuredContent.asset_id !== asset_id)
        throw new Error('Approved asset bytes are not retrievable: ' + asset_id);
    }
    console.log('PASS twelve live public MCP tools; ' + approvedIds.length + ' audited sources and ' + deniedIds.length + ' denied candidates from ' + expectedRef);
  }
  await verifyHttp(portal, 'META GAMES portal');
  for (const [name, relative] of [
    ['Twilight Island', '../observer-world-en-v7/'],
    ['Ashen Path', '../ashen-sumerek/'],
    ['Underwater World', '../underwater-world/'],
    ['Three Worlds', '../three-worlds-game/'],
    ...(expectedGameIds.includes('veil-terraces') ? [['Veil Terraces', '../meta-games-worlds/veil-terraces/']] : [])
  ]) {
    await verifyHttp(new URL(relative, portal), name);
  }
}
await run();
