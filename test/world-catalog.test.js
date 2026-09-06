'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
process.chdir(root);
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'app-release-registry.json'), 'utf8'));

function callApps(url) {
  const handler = require('../api/apps');
  return new Promise(resolve => {
    const headers = {};
    const res = {
      setHeader(k, v) { headers[k] = v; },
      end(body) { resolve({ statusCode: this.statusCode, headers, body: JSON.parse(body) }); }
    };
    handler({ method: 'GET', url, headers: { host: 'localhost' } }, res);
  });
}

test('public app list remains deny-by-default and certified-only', async () => {
  const { statusCode, body } = await callApps('/api/apps');
  assert.equal(statusCode, 200);
  assert.equal(body.releasePolicy, 'deny-by-default');
  assert.ok(body.apps.length > 0);
  assert.ok(body.apps.every(app => app.status === 'certified'));
  assert.equal(body.inventory, undefined);
});

test('all=1 inventory preserves every local app with index.html', async () => {
  const { statusCode, body } = await callApps('/api/apps?all=1');
  assert.equal(statusCode, 200);
  const ids = new Set(body.inventory.filter(x => !x.external).map(x => x.id));
  const localIds = fs.readdirSync(path.join(root, 'apps'), { withFileTypes: true })
    .filter(x => x.isDirectory() && fs.existsSync(path.join(root, 'apps', x.name, 'index.html')))
    .map(x => x.name);
  for (const id of localIds) assert.ok(ids.has(id), `local app disappeared from inventory: ${id}`);
});

test('legacy deployment inventory is unique, HTTPS, and never silently dropped', async () => {
  const { body } = await callApps('/api/apps?all=1');
  const external = body.inventory.filter(x => x.external);
  assert.equal(external.length, registry.externalWorlds.length);
  const ids = new Set(); const urls = new Set();
  for (const item of external) {
    assert.ok(item.id && !ids.has(item.id), `duplicate external id: ${item.id}`); ids.add(item.id);
    assert.match(item.url, /^https:\/\//); assert.ok(!urls.has(item.url), `duplicate external URL: ${item.url}`); urls.add(item.url);
  }
});

test('core playable worlds always include the global catalog navigation', () => {
  for (const id of ['ai3d-voxel-city','voxel-world','dark-void-scene','survival','world-sharabass']) {
    const html = fs.readFileSync(path.join(root, 'apps', id, 'index.html'), 'utf8');
    assert.match(html, /\/shared\/golden-catalog-menu\.js/, `${id} lost global catalog navigation`);
  }
});
