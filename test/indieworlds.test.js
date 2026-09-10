'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_PUBLIC_BASE_URL,
  requestBaseUrl,
  buildIndieWorldIndex,
  buildRss
} = require('../lib/indieworlds');
const { expectedArtifacts, drift } = require('../scripts/export-indieworlds');

const root = path.resolve(__dirname, '..');
process.chdir(root);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/^\uFEFF/, ''));
}

const registry = readJson('data/app-release-registry.json');
const graph = readJson('data/world-graph-index.json');
const loreBible = readJson('data/world-lore-v2.json');

function project(overrides = {}) {
  return buildIndieWorldIndex({ registry, graph, loreBible, baseUrl: 'https://world.example', ...overrides });
}

function callWorlds(url, method = 'GET', extraHeaders = {}) {
  const handler = require('../api/worlds');
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      end(body) {
        const text = String(body ?? '');
        resolve({ statusCode: this.statusCode, headers, text });
      }
    };
    handler({ method, url, headers: { host: 'world.example', 'x-forwarded-proto': 'https', ...extraHeaders } }, res);
  });
}

test('public IndieWorld index follows the canonical deny-by-default release boundary', () => {
  const index = project();
  const ids = new Set(index.worlds.map((world) => world.id));
  assert.equal(index.releasePolicy, 'deny-by-default');
  assert.equal(index.scope, 'public');
  assert.deepEqual(index.worlds.filter((world) => !world.external).map((world) => world.id).sort(), ['ai3d-voxel-city', 'voxel-world']);
  assert.equal(index.worlds.filter((world) => world.external).length, registry.externalWorlds.length);
  assert.equal(ids.has('survival'), false);
  assert.equal(ids.has('world-sharabass'), false);
  assert.equal(ids.has('dark-void-scene'), false);
});

test('inventory projection labels quarantine worlds without leaking their URLs through public links', () => {
  const publicIndex = project();
  const inventory = project({ includeUncertified: true });
  assert.equal(inventory.scope, 'inventory');
  assert.equal(inventory.worlds.find((world) => world.id === 'survival')?.certified, false);
  assert.equal(inventory.worlds.find((world) => world.id === 'world-sharabass')?.status, 'quarantine');
  assert.equal(inventory.worlds.find((world) => world.id === 'survival').discovery.passport, null);
  assert.equal(inventory.worlds.find((world) => world.id === 'survival').portability.exportable, false);

  const voxel = publicIndex.worlds.find((world) => world.id === 'voxel-world');
  const hiddenPortal = voxel.connections.find((connection) => connection.targetId === 'world-sharabass');
  assert.ok(hiddenPortal?.story);
  assert.equal(hiddenPortal.targetUrl, null);
  assert.equal(hiddenPortal.webmention, null);
  assert.equal(voxel.discovery.webmention.receiverAdvertised, false);
  assert.equal(inventory.worlds.find((world) => world.id === 'world-sharabass').connections.some((connection) => connection.webmention), false);
});

test('public world-to-world links carry Webmention-compatible source and target metadata', () => {
  const city = project().worlds.find((world) => world.id === 'ai3d-voxel-city');
  const portal = city.connections.find((connection) => connection.targetId === 'voxel-world');
  assert.deepEqual(portal.webmention, {
    source: 'https://world.example/apps/ai3d-voxel-city/',
    target: 'https://world.example/apps/voxel-world/'
  });
  assert.equal(city.discovery.webmention.compatibleLinks, true);
  assert.equal(city.discovery.webmention.state, 'receiver-pending-persistence-and-moderation-gate');
});

test('future external worlds require an explicit live status and explicit menu publication', () => {
  const candidateRegistry = structuredClone(registry);
  candidateRegistry.apps = {};
  candidateRegistry.externalWorlds = [
    { id: 'approved-live', title: 'Approved', url: 'https://approved.example/', status: 'legacy-deployment', worldMenu: { show: true } },
    { id: 'future-quarantine', title: 'Quarantine', url: 'https://quarantine.example/', status: 'quarantine', worldMenu: { show: true } },
    { id: 'implicit-live', title: 'Implicit', url: 'https://implicit.example/', status: 'legacy-deployment', worldMenu: {} }
  ];
  const index = buildIndieWorldIndex({ registry: candidateRegistry, graph: { worlds: [] }, loreBible: { worlds: {}, requiredElements: [] }, baseUrl: 'https://world.example' });
  assert.deepEqual(index.worlds.map((world) => world.id), ['approved-live']);
});

test('RSS escapes world-controlled text and remains deterministic', () => {
  const index = {
    name: 'World & <Network>',
    url: 'https://world.example/',
    feed: 'https://world.example/feed.xml?x=1&y=2',
    worlds: [{
      url: 'https://world.example/a?x=1&y=2',
      headline: '<script>alert("x")</script>',
      name: 'Unsafe',
      description: 'A & B </description><script>',
      kind: 'game',
      status: 'certified'
    }]
  };
  const one = buildRss(index);
  const two = buildRss(index);
  assert.equal(one, two);
  assert.equal(one.includes('<script>'), false);
  assert.match(one, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(one, /x=1&amp;y=2/);
});

test('request origin rejects malformed hosts and credentials', () => {
  assert.equal(requestBaseUrl({ headers: { host: 'world.example:8443', 'x-forwarded-proto': 'http' } }), DEFAULT_PUBLIC_BASE_URL);
  assert.equal(requestBaseUrl({ headers: { 'x-forwarded-host': 'attacker.example', host: 'world.example' } }), DEFAULT_PUBLIC_BASE_URL);
  assert.equal(requestBaseUrl({ headers: { host: 'attacker.example' } }, 'https://configured.example/base'), 'https://configured.example');
  assert.equal(requestBaseUrl({ headers: { host: '127.0.0.1:43127' } }), 'http://127.0.0.1:43127');
  assert.equal(requestBaseUrl({ headers: { host: '[::1]:43127' } }), 'http://[::1]:43127');
  assert.equal(requestBaseUrl({ headers: { host: 'world.example\r\nx-injected: yes' } }), DEFAULT_PUBLIC_BASE_URL);
  assert.equal(requestBaseUrl({ headers: { host: 'user:secret@world.example' } }), DEFAULT_PUBLIC_BASE_URL);
});

test('checked-in static exports match canonical data and contain only public passports', () => {
  assert.deepEqual(drift(), []);
  const artifacts = expectedArtifacts();
  const passports = [...artifacts.keys()].filter((name) => name.startsWith('worlds/'));
  assert.equal(artifacts.size, passports.length + 2);
  assert.equal(passports.includes('worlds/survival.json'), false);
  assert.equal(passports.includes('worlds/world-sharabass.json'), false);
});

test('world API remains backward-compatible while exposing opt-in IndieWorld formats', async () => {
  const legacy = await callWorlds('/api/worlds');
  assert.equal(legacy.statusCode, 200);
  const legacyBody = JSON.parse(legacy.text);
  assert.ok(Array.isArray(legacyBody.worlds));
  assert.ok(legacyBody.graph);
  assert.equal(legacyBody.type, undefined);

  const indexResponse = await callWorlds('/api/worlds?format=indieweb');
  assert.equal(indexResponse.statusCode, 200);
  assert.equal(JSON.parse(indexResponse.text).type, 'IndieWorldNetwork');

  const passport = await callWorlds('/api/worlds?format=indieweb&id=voxel-world');
  assert.equal(passport.statusCode, 200);
  assert.match(passport.headers['content-type'], /^application\/vnd\.world-server\.indieworld\+json/);
  assert.match(passport.headers['content-disposition'], /voxel-world\.indieworld\.json/);
  assert.equal(JSON.parse(passport.text).id, 'voxel-world');

  const hidden = await callWorlds('/api/worlds?format=indieweb&id=survival');
  assert.equal(hidden.statusCode, 404);
  const inventory = await callWorlds('/api/worlds?format=indieweb&scope=inventory&id=survival');
  assert.equal(inventory.statusCode, 400);
  assert.equal(inventory.headers['cache-control'], 'no-store');

  const rss = await callWorlds('/api/worlds?format=rss');
  assert.equal(rss.statusCode, 200);
  assert.match(rss.headers['content-type'], /^application\/rss\+xml/);
  assert.match(rss.text, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal(rss.text.includes('<script>'), false);

  const unknown = await callWorlds('/api/worlds?format=activitypub');
  assert.equal(unknown.statusCode, 400);
  const writeAttempt = await callWorlds('/api/worlds?format=indieweb', 'POST');
  assert.equal(writeAttempt.statusCode, 405);
  assert.equal(writeAttempt.headers.allow, 'GET');
});

test('Golden UI publishes discovery metadata and keeps draft passports gated', () => {
  const shell = fs.readFileSync(path.join(root, 'shared', 'golden-ui-shell.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'shared', 'golden-ui-shell.css'), 'utf8');
  assert.match(shell, /application\/ld\+json/);
  assert.match(shell, /application\/vnd\.world-server\.indieworld\+json/);
  assert.match(shell, /Паспорт независимого мира/);
  assert.match(shell, /ЖДЁТ СЕРТИФИКАЦИИ/);
  assert.match(css, /#goldenIndieWorld/);
  assert.match(css, /\.goldenIndieActions a\{[^}]*min-height:44px/);
  assert.match(css, /\.goldenIndieActions a:focus-visible/);

  for (const [file, passport] of [
    ['apps/catalog/index.html', '/shared/indieworlds/index.json'],
    ['apps/voxel-world/index.html', '/shared/indieworlds/worlds/voxel-world.json'],
    ['apps/ai3d-voxel-city/index.html', '/shared/indieworlds/worlds/ai3d-voxel-city.json']
  ]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /application\/rss\+xml/);
    assert.ok(html.includes(passport), `${file} missing its static IndieWorld representation`);
  }
});

test('local static server serves the RSS fallback with its real MIME type', () => {
  const source = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(source, /['"]\.xml['"]:\s*['"]application\/rss\+xml; charset=utf-8['"]/);
});

test('Netlify exposes the same /api/worlds compatibility function', () => {
  const source = fs.readFileSync(path.join(root, 'netlify', 'functions', 'worlds.mts'), 'utf8');
  assert.match(source, /path:\s*['"]\/api\/worlds['"]/);
  assert.match(source, /api\/worlds\.js/);
  assert.match(source, /url\.search/);
});
