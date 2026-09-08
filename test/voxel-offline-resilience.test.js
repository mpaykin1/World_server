const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');

test('Voxel World degrades to a playable local world when backend/bootstrap fails', () => {
  assert.match(source, /let backendMode='online'/);
  assert.match(source, /setOfflineMode\(e\.message\);materializeChunkBatch\(need\)/);
  assert.match(source, /backendMode==='offline'\) materializeChunkBatch\(need\)/);
  assert.match(source, /loading\.classList\.add\('hidden'\)/);
  assert.match(source, /playable:started&&chunks\.size>0/);
});

test('offline editing stays local instead of rolling the player action back', () => {
  assert.match(source, /офлайн · изменение сохранено локально/);
  assert.doesNotMatch(source, /catch\(e\)\{setBlockLocal\(c\.x,c\.y,c\.z,old\);statusEl\.textContent=e\.message/);
});


test('Netlify bridge reuses canonical Vercel handlers instead of duplicating backend logic', () => {
  const configFn = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'config.mts'), 'utf8');
  const voxelFn = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'voxel.mts'), 'utf8');
  assert.match(configFn, /require\('\.\.\/\.\.\/api\/config\.js'\)/);
  assert.match(configFn, /path: '\/api\/config'/);
  assert.match(voxelFn, /require\('\.\.\/\.\.\/api\/voxel\.js'\)/);
  assert.match(voxelFn, /path: '\/api\/voxel'/);
});

test('public env lookup can use Netlify.env without weakening process.env fallback', () => {
  const envSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'env.js'), 'utf8');
  assert.match(envSource, /globalThis\.Netlify\?\.env\?\.get\?\.\(name\)/);
  assert.match(envSource, /process\.env\[name\]/);
});


test('Netlify API uses canonical upstream before procedural offline fallback when local admin secret is absent', () => {
  const upstream = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', '_upstream.mts'), 'utf8');
  const voxelFn = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'voxel.mts'), 'utf8');
  assert.match(upstream, /WORLD_SERVER_API_ORIGIN/);
  assert.match(upstream, /canonical-upstream/);
  assert.match(upstream, /offline-fallback-required/);
  assert.match(voxelFn, /hasAdminSupabase\(\)/);
  assert.match(voxelFn, /proxyCanonical\(request, '\/api\/voxel'\)/);
});
