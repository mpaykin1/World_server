'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  handleHandshake,
  handleWorld,
  handleChunk,
  handleEvents,
  handleTelemetry,
  resetRateLimits
} = require('../lib/roblox-adapter');

function createMockRes() {
  const state = { statusCode: 200, headers: {}, body: '' };
  const res = {
    get statusCode() { return state.statusCode; },
    set statusCode(val) { state.statusCode = val; },
    setHeader(k, v) { state.headers[k.toLowerCase()] = v; },
    end(val) { state.body = String(val || ''); }
  };
  return {
    res,
    get status() { return state.statusCode; },
    get json() { return JSON.parse(state.body || '{}'); },
    get body() { return state.body; }
  };
}

function mockReq(method, url, bodyObj = null, headersObj = {}) {
  const reqStream = new (require('stream').Readable)({ read() {} });
  reqStream.method = method;
  reqStream.url = url;
  reqStream.headers = Object.assign({ host: 'localhost' }, headersObj);
  if (bodyObj !== null) {
    reqStream.body = bodyObj;
    const payload = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    reqStream.push(payload);
  }
  reqStream.push(null);
  return reqStream;
}

test('POST /api/roblox/handshake - protocol=2 negotiation and fail-closed checks', async () => {
  // Test valid protocol=2
  {
    const req = mockReq('POST', '/api/roblox/handshake', { protocol: 2, clientVersion: '2.1' });
    const mock = createMockRes();
    await handleHandshake(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.ok, true);
    assert.equal(mock.json.protocol, 2);
    assert.equal(mock.json.capabilities.world_graph, true);
  }

  // Test invalid protocol=1 (fail closed)
  {
    const req = mockReq('POST', '/api/roblox/handshake', { protocol: 1 });
    const mock = createMockRes();
    await handleHandshake(req, mock.res);
    assert.equal(mock.status, 400);
    assert.equal(mock.json.ok, false);
    assert.match(mock.json.error, /Unsupported protocol/);
  }

  // Test method not allowed (GET)
  {
    const req = mockReq('GET', '/api/roblox/handshake');
    const mock = createMockRes();
    await handleHandshake(req, mock.res);
    assert.equal(mock.status, 405);
  }
});

test('GET /api/roblox/world - world graph retrieval & bounded schema clamps', async () => {
  // Test listing public worlds
  {
    const req = mockReq('GET', '/api/roblox/world');
    const mock = createMockRes();
    await handleWorld(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.ok, true);
    assert.equal(mock.json.protocol, 2);
    assert.ok(Array.isArray(mock.json.worlds));
    assert.ok(mock.json.worlds.length > 0);
    assert.ok(mock.json.worlds[0].bounds);
  }

  // Test filtering by world ID
  {
    const req = mockReq('GET', '/api/roblox/world?id=voxel-world');
    const mock = createMockRes();
    await handleWorld(req, mock.res);
    assert.equal(mock.status, 200);
    assert.ok(mock.json.worlds.length >= 1);
    assert.equal(mock.json.worlds[0].id, 'voxel-world');
  }

  // Test unknown world ID (404)
  {
    const req = mockReq('GET', '/api/roblox/world?id=nonexistent-world-999');
    const mock = createMockRes();
    await handleWorld(req, mock.res);
    assert.equal(mock.status, 404);
    assert.equal(mock.json.ok, false);
  }
});

test('GET /api/roblox/chunk - bounded coordinate clamps & voxel schema', async () => {
  // Test valid chunk coordinates
  {
    const req = mockReq('GET', '/api/roblox/chunk?worldId=voxel-world&x=1&y=0&z=-2');
    const mock = createMockRes();
    await handleChunk(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.ok, true);
    assert.equal(mock.json.chunk.x, 1);
    assert.equal(mock.json.chunk.y, 0);
    assert.equal(mock.json.chunk.z, -2);
    assert.equal(mock.json.chunk.voxels.length, 64);
  }

  // Test out-of-bounds coordinates (clamping)
  {
    const req = mockReq('GET', '/api/roblox/chunk?x=100&y=-50&z=0');
    const mock = createMockRes();
    await handleChunk(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.chunk.x, 10);
    assert.equal(mock.json.chunk.y, -10);
  }

  // Test non-numeric coordinates (fail closed 400)
  {
    const req = mockReq('GET', '/api/roblox/chunk?x=invalid');
    const mock = createMockRes();
    await handleChunk(req, mock.res);
    assert.equal(mock.status, 400);
  }
});

test('POST /api/roblox/events - event type validation & rate/payload bounds', async () => {
  resetRateLimits();

  // Test valid event payload
  {
    const req = mockReq('POST', '/api/roblox/events', {
      events: [
        { type: 'player_join', userId: 123 },
        { type: 'action', name: 'jump' }
      ]
    });
    const mock = createMockRes();
    await handleEvents(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.ok, true);
    assert.equal(mock.json.processed, 2);
  }

  // Test invalid event type (400 fail-closed)
  {
    const req = mockReq('POST', '/api/roblox/events', {
      events: [{ type: 'malicious_eval_type' }]
    });
    const mock = createMockRes();
    await handleEvents(req, mock.res);
    assert.equal(mock.status, 400);
  }
});

test('POST /api/roblox/telemetry - numeric metric clamping & schema validation', async () => {
  resetRateLimits();

  // Test valid telemetry
  {
    const req = mockReq('POST', '/api/roblox/telemetry', {
      fps: 120,
      memoryMB: 512,
      pingMs: 25,
      client: 'roblox_studio_v2.1'
    });
    const mock = createMockRes();
    await handleTelemetry(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.ok, true);
    assert.equal(mock.json.metrics.fps, 120);
    assert.equal(mock.json.metrics.memoryMB, 512);
    assert.equal(mock.json.metrics.pingMs, 25);
  }

  // Test metric clamping for extreme values
  {
    const req = mockReq('POST', '/api/roblox/telemetry', {
      fps: 9999,
      memoryMB: -50,
      pingMs: 1000000
    });
    const mock = createMockRes();
    await handleTelemetry(req, mock.res);
    assert.equal(mock.status, 200);
    assert.equal(mock.json.metrics.fps, 240);
    assert.equal(mock.json.metrics.memoryMB, 0);
    assert.equal(mock.json.metrics.pingMs, 10000);
  }

  // Test non-numeric metrics (400 error)
  {
    const req = mockReq('POST', '/api/roblox/telemetry', { fps: 'not_a_number' });
    const mock = createMockRes();
    await handleTelemetry(req, mock.res);
    assert.equal(mock.status, 400);
  }
});
