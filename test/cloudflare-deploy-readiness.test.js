'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { probeCloudflareReadiness, waitForCloudflareReadiness } =
  require('../scripts/wait-for-cloudflare-deploy.cjs');

const SHA = 'a'.repeat(40);
const ORIGIN = 'https://world-server-pr-247.example.test';

function mockResponse(status, body, url) {
  return {
    ok: status >= 200 && status < 300, status, url,
    text: async () => body,
    json: async () => JSON.parse(body)
  };
}

test('readiness waits for transient asset 404 and then requires exact deployed SHA', async () => {
  let calls = 0;
  const events = [];
  const ready = await waitForCloudflareReadiness(ORIGIN, SHA, {
    probe: async (origin, sha) => {
      calls++;
      assert.equal(origin, ORIGIN);
      assert.equal(sha, SHA);
      if (calls === 1) throw new Error('/: HTTP 404');
      return { deployedRevision: SHA, checkedPaths: ['/', '/api/config'] };
    },
    timeoutMs: 100,
    intervalMs: 1,
    now: () => calls * 10,
    sleep: async ms => assert.equal(ms, 1),
    log: message => events.push(message)
  });
  assert.equal(ready.attempts, 2);
  assert.match(events[0], /404/);
});

test('readiness times out and never accepts a persistent wrong revision', async () => {
  let time = 0;
  await assert.rejects(
    waitForCloudflareReadiness(ORIGIN, SHA, {
      probe: async () => { throw new Error('revision mismatch'); },
      timeoutMs: 10, intervalMs: 4,
      now: () => time, sleep: async ms => { time += ms; }, log: () => {}
    }), /Timed out.*revision mismatch/
  );
});

test('readiness rejects invalid Git revision before any network access', async () => {
  await assert.rejects(waitForCloudflareReadiness(ORIGIN, 'latest'), /exact 40-character SHA/);
});

test('probe requires healthy pages and exact Cloudflare revision', async () => {
  const calls = [];
  const fetcher = async url => {
    const pathname = new URL(url).pathname;
    calls.push(pathname);
    return mockResponse(200, pathname === '/api/config'
      ? JSON.stringify({ configured: true, deploymentProvider: 'cloudflare', deployedRevision: SHA })
      : '<!doctype html>' + 'x'.repeat(200), url.href);
  };
  const result = await probeCloudflareReadiness(ORIGIN, SHA, fetcher);
  assert.equal(result.deployedRevision, SHA);
  assert.deepEqual(calls, ['/', '/apps/catalog/', '/apps/voxel-world/', '/api/config']);
  await assert.rejects(
    probeCloudflareReadiness(ORIGIN, 'b'.repeat(40), fetcher), /expected b{40}, got a{40}/
  );
});

test('probe fails closed on HTTP 404 even if other routes are available', async () => {
  const fetcher = async url => mockResponse(new URL(url).pathname === '/apps/catalog/' ? 404 : 200,
    '<!doctype html>' + 'x'.repeat(200), url.href);
  await assert.rejects(probeCloudflareReadiness(ORIGIN, SHA, fetcher), /catalog.*HTTP 404/);
});
