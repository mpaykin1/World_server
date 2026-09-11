const DEFAULT_API_ORIGIN = 'https://world-server-ai-studio-bridge-514578099152.europe-west2.run.app';
const DEFAULT_STACK_READ_ORIGIN = 'https://iphfwxjuhsucvdyluink.supabase.co/functions/v1/world-stack-read';
const DEFAULT_STACK_WRITE_ORIGIN = 'https://iphfwxjuhsucvdyluink.supabase.co/functions/v1/world-stack-write';

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=60, stale-while-revalidate=300' : 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers
    }
  });
}

async function asset(env, requestUrl, pathname) {
  const url = new URL(pathname, requestUrl);
  const response = await env.ASSETS.fetch(new Request(url, { method: 'GET' }));
  if (!response.ok) throw new Error(`Cloudflare asset missing: ${pathname} (${response.status})`);
  return response;
}

async function assetJson(env, requestUrl, pathname) {
  return (await asset(env, requestUrl, pathname)).json();
}

async function appsApi(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' });
  }
  const fallback = await assetJson(env, url, '/shared/world-catalog-fallback.json');
  const inventory = Array.isArray(fallback.inventory) ? fallback.inventory : [];
  const apps = inventory
    .filter((item) => item.external !== true && item.certified === true && item.status === 'certified')
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      url: item.url,
      icon: item.icon || '',
      status: item.status,
      goldenStandard: item.goldenStandard || 'v2',
      worldMenu: item.worldMenu || null
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  const body = {
    apps,
    releasePolicy: fallback.releasePolicy || 'deny-by-default',
    goldenStandard: 'v2',
    loreGraph: fallback.loreGraph || null,
    edgeRuntime: 'cloudflare-native-read'
  };
  if (url.searchParams.get('all') === '1') {
    body.inventory = inventory;
    body.inventoryLoreGraph = fallback.loreGraph || null;
    body.inventoryRule = 'Static canonical inventory generated from release registry + lore bible.';
  }
  return request.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }) : jsonResponse(body);
}

function publicWorldsFromGraph(graph) {
  return (Array.isArray(graph?.worlds) ? graph.worlds : [])
    .filter((world) => world.public === true && world.status === 'certified')
    .map((world) => ({
      id: world.id,
      title: world.title,
      description: world.description,
      lore: world.lore,
      capabilities: Array.isArray(world.capabilities) ? world.capabilities : [],
      latestRevisionId: world.latestRevisionId || null,
      revisions: (world.revisions || []).map((revision) => ({
        revisionId: revision.revisionId,
        version: revision.version,
        manifestHash: revision.manifestHash,
        source: revision.source || null
      })),
      portals: Array.isArray(world.portals) ? world.portals : [],
      releaseAppId: world.releaseAppId,
      status: world.status
    }));
}

async function worldsApi(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { allow: 'GET, HEAD' });
  }
  const format = url.searchParams.get('format') || 'default';
  const requested = url.searchParams.get('id');
  if (format === 'rss') {
    if (requested) return jsonResponse({ error: 'RSS does not accept id' }, 400);
    const response = await asset(env, url, '/shared/indieworlds/feed.xml');
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: 200,
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
        'x-content-type-options': 'nosniff'
      }
    });
  }
  if (format === 'indieweb') {
    const path = requested
      ? `/shared/indieworlds/worlds/${encodeURIComponent(requested)}.json`
      : '/shared/indieworlds/index.json';
    try {
      const response = await asset(env, url, path);
      const headers = {
        'content-type': requested
          ? 'application/vnd.world-server.indieworld+json; charset=utf-8'
          : 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
        'x-content-type-options': 'nosniff'
      };
      if (requested) headers['content-disposition'] = `inline; filename="${requested}.indieworld.json"`;
      return new Response(request.method === 'HEAD' ? null : response.body, { status: 200, headers });
    } catch {
      return jsonResponse({ error: 'World not found' }, 404);
    }
  }
  if (format !== 'default') return jsonResponse({ error: 'Unknown world representation' }, 400);
  const graph = await assetJson(env, url, '/data/world-graph-index.json');
  const worlds = publicWorldsFromGraph(graph);
  const selected = requested
    ? worlds.filter((world) => world.id === requested || world.releaseAppId === requested)
    : worlds;
  if (requested && !selected.length) return jsonResponse({ error: 'World not found' }, 404);
  const body = {
    worlds: selected,
    graph: {
      nodes: selected.map(({ id }) => id),
      edges: selected.flatMap((world) => world.portals.map((portal) => ({
        from: world.id,
        to: portal.targetWorldId,
        id: portal.id,
        label: portal.label
      })))
    },
    edgeRuntime: 'cloudflare-native-read'
  };
  return request.method === 'HEAD' ? new Response(null, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }) : jsonResponse(body);
}

function canonicalApiOrigin(env, requestUrl) {
  const configured = String(env.WORLD_SERVER_API_ORIGIN || DEFAULT_API_ORIGIN).trim();
  const origin = new URL(configured);
  if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('WORLD_SERVER_API_ORIGIN must be a credential-free HTTPS origin');
  if (origin.origin === requestUrl.origin) throw new Error('WORLD_SERVER_API_ORIGIN cannot point back to the same Cloudflare worker');
  return origin;
}

function stackOrigin(env, write) {
  const configured = String(write ? (env.WORLD_SERVER_STACK_WRITE_ORIGIN || DEFAULT_STACK_WRITE_ORIGIN) : (env.WORLD_SERVER_STACK_READ_ORIGIN || DEFAULT_STACK_READ_ORIGIN)).trim();
  const target = new URL(configured);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('World stack origin must be credential-free HTTPS');
  return target;
}

async function proxyWorldStack(request, env, url, route) {
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  if (write && !request.headers.get('authorization')) return jsonResponse({ error: 'Sign in to create worlds or change canon.' }, 401);
  const target = stackOrigin(env, write);
  target.search = url.search;
  target.searchParams.set('route', route);
  const response = await fetch(new Request(target, request));
  const headers = new Headers(response.headers);
  headers.set('x-world-server-stack-runtime', write ? 'supabase-edge-write' : 'supabase-edge-read');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function proxyDynamicApi(request, env, url) {
  const origin = canonicalApiOrigin(env, url);
  const upstream = new URL(url.pathname + url.search, origin);
  const proxied = new Request(upstream, request);
  const response = await fetch(proxied);
  const headers = new Headers(response.headers);
  headers.set('x-world-server-api-upstream', origin.host);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect(new URL('/apps/catalog/', url), 302);

    if (url.pathname === '/api/apps') return appsApi(request, env, url);
    if (url.pathname === '/api/worlds') return worldsApi(request, env, url);
    if (url.pathname === '/api/world-factory') return proxyWorldStack(request, env, url, 'world-factory');
    if (url.pathname === '/api/canon') return proxyWorldStack(request, env, url, 'canon');
    if (url.pathname.startsWith('/api/')) return proxyDynamicApi(request, env, url);

    return env.ASSETS.fetch(request);
  }
};