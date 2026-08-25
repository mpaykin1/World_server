'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const handler = require('../api/apng');
const { encodeApng } = require('../lib/apng-engine');

function solid(width, height, value) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4; out[o] = value; out[o + 1] = value; out[o + 2] = value; out[o + 3] = 255;
  }
  return out;
}

function apng() {
  return encodeApng([
    { rgba: solid(5, 5, 30), delayNum: 10, delayDenRaw: 100 },
    { rgba: solid(5, 5, 40), delayNum: 10, delayDenRaw: 100 }
  ], 5, 5);
}

function request(method, url, body = null, headers = {}) {
  const req = body ? Readable.from([body]) : Readable.from([]);
  req.method = method; req.url = url; req.headers = headers;
  return req;
}

function response() {
  const headers = new Map();
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  return {
    statusCode: 200,
    headers,
    body: Buffer.alloc(0),
    setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
    end(value) { this.body = Buffer.isBuffer(value) ? value : Buffer.from(value || ''); resolve(); },
    done
  };
}

async function call(req) {
  const res = response();
  await handler(req, res);
  await res.done;
  return res;
}

test('health endpoint exposes engine and limits', async () => {
  const res = await call(request('GET', '/api/apng?action=health'));
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body.toString('utf8'));
  assert.equal(json.ok, true);
  assert.match(json.engineVersion, /^3\./);
  assert.ok(json.limits.maxFrames >= 1);
  assert.equal(json.capabilities.bitDepths.includes(16), true);
  assert.equal(json.capabilities.adam7, true);
  assert.equal(json.capabilities.crossBrowserGate, true);
});

test('analyze endpoint returns APNG report', async () => {
  const res = await call(request('POST', '/api/apng?action=analyze', apng(), { 'content-type': 'image/png' }));
  assert.equal(res.statusCode, 200);
  const json = JSON.parse(res.body.toString('utf8'));
  assert.equal(json.ok, true);
  assert.equal(json.report.frameCount, 2);
});

test('repair endpoint returns independently decodable verified PNG', async () => {
  const res = await call(request('POST', '/api/apng?action=repair&temporal=0', apng(), { 'content-type': 'image/png' }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get('x-apng-verified'), '1');
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.ok(Number(res.headers.get('x-apng-quality-score')) >= 0);
  assert.ok(res.body.length > 32);
  const verify = await call(request('POST', '/api/apng?action=analyze', res.body, { 'content-type': 'image/png' }));
  assert.equal(verify.statusCode, 200);
  const json = JSON.parse(verify.body.toString('utf8'));
  assert.equal(json.report.issues.filter((issue) => issue.severity === 'error').length, 0);
});

test('rejects non-PNG body and unsupported content type', async () => {
  const wrongType = await call(request('POST', '/api/apng?action=analyze', Buffer.from('x'), { 'content-type': 'text/plain' }));
  assert.equal(wrongType.statusCode, 415);
  const wrongSignature = await call(request('POST', '/api/apng?action=analyze', Buffer.from('not a png'), { 'content-type': 'image/png' }));
  assert.equal(wrongSignature.statusCode, 415);
});
