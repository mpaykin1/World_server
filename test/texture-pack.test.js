'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Roblox material catalog and runtime atlas cover every opaque voxel block', () => {
  const catalog = require('../apps/voxel-world/materials-roblox.json');
  const runtime = fs.readFileSync(path.join(root, 'apps/voxel-world/texture-pack-runtime.js'), 'utf8');
  assert.equal(catalog.materials.length, 1313);
  for (const block of [1, 2, 3, 4, 5, 7, 10, 11, 12, 13]) {
    assert.match(runtime, new RegExp(`\\n\\s*${block}:\\s*\\{`));
  }
  assert.match(runtime, /material\.map\s*=\s*atlas/);
  assert.match(runtime, /attribute float atlasTile/);
});

test('texture proxy is wired locally and rejects IDs outside the catalog', async () => {
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(serverSource, /'\/api\/roblox-texture', require\('\.\/api\/roblox-texture'\)/);

  const handler = require('../api/roblox-texture');
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(body) { this.body = body; }
  };
  await handler({ method: 'GET', query: { id: '99999999999999999999' } }, response);
  assert.equal(response.statusCode, 404);
  assert.equal(response.body, 'Texture not found');
  assert.equal(handler._private.imageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'binary/octet-stream'), 'image/png');
});
