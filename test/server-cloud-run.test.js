'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const TEST_PORT = 34720;
process.env.PORT = String(TEST_PORT);
delete process.env.WORLD_ENTRYPOINT;

const { server } = require('../server.js');

test.after(() => { server.close(); });

function request(path, { method = 'GET', body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : undefined
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('Cloud Run health endpoint is public no-store JSON', async () => {
  const res = await request('/healthz');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /application\/json/);
  assert.equal(res.headers['cache-control'], 'no-store');
  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.ready, true);
  assert.equal(body.service, 'world-server');
});

test('readiness endpoint is green when server accepts the request', async () => {
  const res = await request('/readyz');
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ready, true);
});

test('native Roblox world subpath works on long-lived server', async () => {
  const res = await request('/api/roblox/world?world=starter');
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.revision, 'worldspec-v3');
  assert.equal(body.worldId, 'starter');
});

test('native Roblox chunk returns deterministic canonical resources', async () => {
  const res = await request('/api/roblox/chunk?world=starter&cx=0&cz=0');
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.objects.length, 13);
  assert.equal(body.objects[0].id, 'r:0:0:0');
});

test('native Roblox handshake works over POST', async () => {
  const res = await request('/api/roblox/handshake', { method: 'POST', body: { protocol: 3, worldId: 'starter' } });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).protocol, 3);
});
