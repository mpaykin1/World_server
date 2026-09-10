'use strict';

const { worldMenuWithLore } = require('./world-lore');

const DEFAULT_PUBLIC_BASE_URL = 'https://world-server.ai.studio';
const NETWORK_NAME = 'IMPROVE WORLD — IndieWorlds';
const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_HOST = /^(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

function cleanText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeBaseUrl(value, fallback = DEFAULT_PUBLIC_BASE_URL) {
  for (const candidate of [value, fallback]) {
    try {
      const url = new URL(String(candidate || ''));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) continue;
      return url.origin;
    } catch {}
  }
  return DEFAULT_PUBLIC_BASE_URL;
}

function requestBaseUrl(req, configuredBaseUrl = '') {
  if (configuredBaseUrl) return normalizeBaseUrl(configuredBaseUrl);
  const rawHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const rawProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (!SAFE_HOST.test(rawHost)) return DEFAULT_PUBLIC_BASE_URL;
  const loopback = /^(?:localhost|127(?:\.\d{1,3}){3})(?::\d{1,5})?$/i.test(rawHost) || /^\[::1\](?::\d{1,5})?$/i.test(rawHost);
  if (!loopback) return DEFAULT_PUBLIC_BASE_URL;
  const protocol = rawProto === 'http' || rawProto === 'https' ? rawProto : (loopback ? 'http' : 'https');
  return normalizeBaseUrl(`${protocol}://${rawHost}`);
}

function absoluteUrl(baseUrl, value) {
  const base = normalizeBaseUrl(baseUrl);
  try {
    const url = new URL(String(value || ''), `${base}/`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch {
    return '';
  }
}

function xml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function graphByReleaseApp(graph) {
  return new Map((graph?.worlds || []).map((world) => [world.releaseAppId || world.id, world]));
}

function rawCandidates(registry, loreBible, baseUrl) {
  const local = Object.entries(registry?.apps || {})
    .filter(([id, meta]) => WORLD_ID.test(id) && meta?.worldMenu?.show === true)
    .map(([id, meta]) => ({
      id,
      title: cleanText(meta.title, id),
      url: absoluteUrl(baseUrl, `/apps/${id}/`),
      status: cleanText(meta.status, 'unregistered'),
      kind: cleanText(meta.kind, 'game'),
      certified: meta.visible === true && meta.status === 'certified',
      external: false,
      worldMenu: worldMenuWithLore(id, meta.worldMenu, loreBible)
    }));
  const external = (registry?.externalWorlds || [])
    .filter((item) => WORLD_ID.test(item?.id || '') && item?.worldMenu?.show === true && item?.status === 'legacy-deployment')
    .map((item) => ({
      id: item.id,
      title: cleanText(item.title, item.id),
      url: absoluteUrl(baseUrl, item.url),
      status: cleanText(item.status, 'legacy-deployment'),
      kind: cleanText(item.kind, 'world'),
      certified: false,
      external: true,
      worldMenu: worldMenuWithLore(item.id, item.worldMenu, loreBible)
    }))
    .filter((item) => item.url);
  return [...local, ...external];
}

function isPublicCandidate(item) {
  return item.certified === true || (item.external === true && item.status === 'legacy-deployment');
}

function buildIndieWorldIndex({ registry, graph, loreBible, baseUrl = DEFAULT_PUBLIC_BASE_URL, includeUncertified = false } = {}) {
  if (!registry || registry.policy !== 'deny-by-default') throw new Error('IndieWorlds requires the canonical deny-by-default release registry');
  const origin = normalizeBaseUrl(baseUrl);
  const graphLookup = graphByReleaseApp(graph);
  const candidates = rawCandidates(registry, loreBible, origin);
  const publicIds = new Set(candidates.filter(isPublicCandidate).map((item) => item.id));
  const selected = candidates.filter((item) => includeUncertified || isPublicCandidate(item));
  const lookup = new Map(candidates.map((item) => [item.id, item]));
  const feedUrl = absoluteUrl(origin, '/api/worlds?format=rss');
  const indexUrl = absoluteUrl(origin, '/api/worlds?format=indieweb');

  const worlds = selected.map((item) => {
    const graphWorld = graphLookup.get(item.id);
    const menu = item.worldMenu || {};
    const rawConnections = Array.isArray(menu.connections) && menu.connections.length
      ? menu.connections
      : (graphWorld?.portals || []).map((portal) => ({ targetId: portal.targetWorldId, story: portal.label }));
    const connections = rawConnections.flatMap((connection) => {
      const targetId = cleanText(connection.targetId);
      if (!WORLD_ID.test(targetId)) return [];
      const target = lookup.get(targetId);
      const canLink = publicIds.has(item.id) && target && publicIds.has(target.id);
      return [{
        relation: 'portal',
        targetId,
        targetTitle: target?.title || targetId,
        targetUrl: canLink ? target.url : null,
        story: cleanText(connection.story, 'Между мирами существует скрытая связь.'),
        webmention: canLink ? { source: item.url, target: target.url } : null
      }];
    });
    const published = publicIds.has(item.id);
    const passportUrl = published ? absoluteUrl(origin, `/api/worlds?format=indieweb&id=${encodeURIComponent(item.id)}`) : null;
    return {
      schemaVersion: '1.0.0',
      type: 'IndieWorld',
      id: item.id,
      name: item.title,
      headline: cleanText(menu.headline, item.title),
      description: cleanText(menu.lore, graphWorld?.lore || item.title),
      history: cleanText(menu.history),
      url: item.url,
      status: item.status,
      kind: item.kind,
      certified: item.certified,
      external: item.external,
      latestRevisionId: graphWorld?.latestRevisionId || null,
      capabilities: Array.isArray(graphWorld?.capabilities) ? [...graphWorld.capabilities] : [],
      connections,
      discovery: {
        network: NETWORK_NAME,
        index: indexUrl,
        feed: feedUrl,
        passport: passportUrl,
        webmention: {
          compatibleLinks: connections.some((connection) => connection.webmention),
          receiverAdvertised: false,
          state: 'receiver-pending-persistence-and-moderation-gate'
        }
      },
      portability: {
        exportable: published,
        format: 'application/vnd.world-server.indieworld+json',
        ownsAddress: true,
        humanFirst: true
      }
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return {
    schemaVersion: '1.0.0',
    type: 'IndieWorldNetwork',
    name: NETWORK_NAME,
    url: absoluteUrl(origin, '/apps/catalog/'),
    feed: feedUrl,
    releasePolicy: registry.policy,
    scope: includeUncertified ? 'inventory' : 'public',
    principles: ['own-address', 'portable-metadata', 'human-first', 'linked-worlds', 'open-discovery'],
    worlds
  };
}

function buildRss(index) {
  if (!index || !Array.isArray(index.worlds)) throw new Error('IndieWorld RSS requires a projected index');
  const items = index.worlds.map((world) => `    <item>
      <guid isPermaLink="true">${xml(world.url)}</guid>
      <title>${xml(world.headline || world.name)}</title>
      <link>${xml(world.url)}</link>
      <description>${xml(world.description)}</description>
      <category>${xml(world.kind)}</category>
      <category>${xml(world.status)}</category>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(index.name)}</title>
    <link>${xml(index.url)}</link>
    <description>Независимые миры, истории и порталы World Server.</description>
    <language>ru</language>
    <atom:link href="${xml(index.feed)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

function projectStaticArtifacts(input) {
  const index = buildIndieWorldIndex({ ...input, includeUncertified: false });
  const artifacts = new Map([
    ['index.json', `${JSON.stringify(index, null, 2)}\n`],
    ['feed.xml', buildRss(index)]
  ]);
  for (const world of index.worlds) artifacts.set(`worlds/${world.id}.json`, `${JSON.stringify(world, null, 2)}\n`);
  return artifacts;
}

module.exports = {
  DEFAULT_PUBLIC_BASE_URL,
  NETWORK_NAME,
  normalizeBaseUrl,
  requestBaseUrl,
  absoluteUrl,
  xml,
  buildIndieWorldIndex,
  buildRss,
  projectStaticArtifacts
};
