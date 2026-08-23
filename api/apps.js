'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

const root = process.cwd();
const registryPath = path.join(root, 'data', 'app-release-registry.json');

function titleFromIndex(appDir, fallback) {
  try {
    const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
    return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || fallback;
  } catch { return fallback; }
}

function loadRegistry() {
  const raw = fs.readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.policy !== 'deny-by-default' || typeof parsed.apps !== 'object') {
    throw new Error('Golden release registry invalid');
  }
  return parsed;
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const appsDir = path.join(root, 'apps');
  const registry = loadRegistry();

  const apps = Object.entries(registry.apps)
    .filter(([,meta]) => meta && meta.visible === true && meta.status === 'certified')
    .map(([id, meta]) => {
      const dir = path.join(appsDir, id);
      if (!fs.existsSync(path.join(dir, 'index.html'))) {
        throw new Error(`Certified app missing index.html: ${id}`);
      }
      return {
        id,
        title: meta.title || titleFromIndex(dir, id.replace(/[-_]+/g, ' ')),
        description: meta.description || '',
        url: `/apps/${id}/`,
        icon: fs.existsSync(path.join(dir, 'ico.png')) ? `/apps/${id}/ico.png` : '',
        status: meta.status,
        goldenStandard: meta.goldenStandard || 'v2'
      };
    })
    .sort((a,b) => a.title.localeCompare(b.title,'ru'));

  sendJson(res, 200, {
    apps,
    releasePolicy: registry.policy,
    goldenStandard: registry.version
  });
});
