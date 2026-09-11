'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');
const { worldMenuWithLore, buildUniversalLoreGraph } = require('../lib/world-lore');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'app-release-registry.json');
const lorePath = path.join(root, 'data', 'world-lore-v2.json');

function titleFromIndex(appDir, fallback) {
  try {
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || fallback;
  } catch { return fallback; }
}

function loadRegistry() {
  const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (!parsed || parsed.policy !== 'deny-by-default' || typeof parsed.apps !== 'object') {
    throw new Error('Golden release registry invalid');
  }
  return parsed;
}

function loadLoreBible() {
  const parsed = JSON.parse(fs.readFileSync(lorePath, 'utf8'));
  if (!parsed || !Array.isArray(parsed.requiredElements) || typeof parsed.worlds !== 'object') {
    throw new Error('World lore bible invalid');
  }
  return parsed;
}

function internalInventory(appsDir, registry, loreBible) {
  const registered = Object.entries(registry.apps).map(([id, meta = {}]) => {
    const dir = path.join(appsDir, id);
    const hasIndex = fs.existsSync(path.join(dir, 'index.html'));
    return {
      id,
      title: meta.title || titleFromIndex(dir, id.replace(/[-_]+/g, ' ')),
      description: meta.description || '',
      url: hasIndex ? `/apps/${id}/` : '',
      localUrl: hasIndex ? `/apps/${id}/` : '',
      status: meta.status || 'unregistered',
      kind: meta.kind || 'app',
      reason: meta.reason || '',
      certified: meta.status === 'certified',
      available: hasIndex,
      source: 'registry',
      worldMenu: worldMenuWithLore(id, meta.worldMenu, loreBible)
    };
  });

  const known = new Set(registered.map(x => x.id));
  const discovered = fs.existsSync(appsDir) ? fs.readdirSync(appsDir, { withFileTypes: true })
    .filter(x => x.isDirectory() && fs.existsSync(path.join(appsDir, x.name, 'index.html')) && !known.has(x.name))
    .map(x => ({
      id: x.name,
      title: titleFromIndex(path.join(appsDir, x.name), x.name.replace(/[-_]+/g, ' ')),
      description: '',
      url: `/apps/${x.name}/`,
      localUrl: `/apps/${x.name}/`,
      status: 'unregistered',
      kind: 'app',
      reason: 'Auto-discovered local app; add it to app-release-registry.json for an explicit lifecycle status.',
      certified: false,
      available: true,
      source: 'auto-discovered',
      worldMenu: worldMenuWithLore(x.name, { show: false }, loreBible)
    })) : [];

  return [...registered, ...discovered];
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const appsDir = path.join(root, 'apps');
  const registry = loadRegistry();
  const loreBible = loadLoreBible();
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const includeAll = requestUrl.searchParams.get('all') === '1';

  const apps = Object.entries(registry.apps)
    .filter(([, meta]) => meta && meta.visible === true && meta.status === 'certified')
    .map(([id, meta]) => {
      const dir = path.join(appsDir, id);
      if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`Certified app missing index.html: ${id}`);
      return {
        id,
        title: meta.title || titleFromIndex(dir, id.replace(/[-_]+/g, ' ')),
        description: meta.description || '',
        url: `/apps/${id}/`,
        icon: fs.existsSync(path.join(dir, 'ico.png')) ? `/apps/${id}/ico.png` : '',
        status: meta.status,
        goldenStandard: meta.goldenStandard || 'v2',
        worldMenu: worldMenuWithLore(id, meta.worldMenu, loreBible)
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  const payload = {
    apps,
    releasePolicy: registry.policy,
    goldenStandard: registry.version,
    loreGraph: buildUniversalLoreGraph(apps, loreBible)
  };
  if (includeAll) {
    const external = (registry.externalWorlds || []).map(x => ({
      ...x,
      worldMenu: worldMenuWithLore(x.id, x.worldMenu, loreBible),
      external: true,
      available: true,
      certified: false,
      source: 'legacy-deployment'
    }));
    payload.inventory = [...internalInventory(appsDir, registry, loreBible), ...external]
      .sort((a, b) => Number(b.certified) - Number(a.certified) || a.title.localeCompare(b.title, 'ru'));
    payload.inventoryLoreGraph = buildUniversalLoreGraph(payload.inventory, loreBible);
    payload.inventoryRule = registry.inventoryRule || '';
  }

  sendJson(res, 200, payload);
});
