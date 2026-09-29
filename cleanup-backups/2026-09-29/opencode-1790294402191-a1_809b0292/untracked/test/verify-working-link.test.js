'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PNG } = require('pngjs');
const deployIdentity = require(path.join(__dirname, '..', 'data', 'cloudflare-deployment-identity.json'));
const {
  ERROR_MARKERS, parseArgs, assertPublicUrl, bodyLooksHealthy,
  screenshotHasVisualSignal, cloudflareIdentityGate
} = require(path.join(__dirname, '..', 'scripts', 'verify-working-link.cjs'));

function fakeResponse({ ok = true, status = 200, headers = {}, body = {} } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name in headers ? headers[name] : null) },
    json: async () => body
  };
}

function makePng(width, height, fill) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4;
      const [r, g, b] = fill(x, y);
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('ERROR_MARKERS include the seven delivered false-positive markers', () => {
  assert.deepEqual(ERROR_MARKERS, [
    'site not found',
    'page not found',
    '404: not_found',
    'deployment_not_found',
    'vercel login',
    'not found - request id',
    'internal server error'
  ]);
});

test('bodyLooksHealthy rejects every ERROR_MARKER and accepts a normal body', () => {
  const bodies = [
    '<html>Site not found</html>',
    '<html>Page not found</html>',
    '<html>404: NOT_FOUND</html>',
    '<html>DEPLOYMENT_NOT_FOUND</html>',
    '<html>Vercel Login</html>',
    '<html>Not found - Request ID: abc</html>',
    '<html><h1>Internal Server Error</h1></html>'
  ];
  for (const body of bodies) {
    assert.equal(bodyLooksHealthy(body), false, `should reject: ${body}`);
  }
  assert.equal(bodyLooksHealthy('<html><head><title>World</title></head><body>game ready</body></html>'), true);
  assert.equal(bodyLooksHealthy(''), true);
  assert.equal(bodyLooksHealthy(undefined), true);
});

test('assertPublicUrl rejects http, localhost and 127.0.0.1 and accepts https', () => {
  assert.throws(() => assertPublicUrl('http://world.example/apps/x/'), /must be HTTPS/);
  assert.throws(() => assertPublicUrl('https://localhost:3000/apps/x/'), /cannot be localhost/);
  assert.throws(() => assertPublicUrl('https://127.0.0.1/apps/x/'), /cannot be localhost/);
  assert.equal(assertPublicUrl('https://world.example/apps/x/').toString(), 'https://world.example/apps/x/');
});

test('parseArgs parses all delivery flags and falls back to environment URL', () => {
  const argv = ['node', 'verify-working-link.cjs', 'https://world.example/', '--game', '--ready-global=GoldenUIShell', '--inventory-id=voxel-world', '--expected-sha=abc123'];
  assert.deepEqual(parseArgs(argv), {
    url: 'https://world.example/',
    game: true,
    readyGlobal: 'GoldenUIShell',
    inventoryId: 'voxel-world',
    expectedSha: 'abc123'
  });
  assert.deepEqual(parseArgs(['node', 'verify-working-link.cjs']).expectedSha, '');

  const preview = process.env[deployIdentity.previewOriginEnvironmentVariable];
  const canonical = process.env[deployIdentity.canonicalOriginEnvironmentVariable];
  try {
    process.env[deployIdentity.previewOriginEnvironmentVariable] = 'https://preview.example/';
    delete process.env[deployIdentity.canonicalOriginEnvironmentVariable];
    assert.equal(parseArgs(['node', 'verify-working-link.cjs']).url, 'https://preview.example/');

    delete process.env[deployIdentity.previewOriginEnvironmentVariable];
    process.env[deployIdentity.canonicalOriginEnvironmentVariable] = 'https://canonical.example/';
    assert.equal(parseArgs(['node', 'verify-working-link.cjs']).url, 'https://canonical.example/');

    assert.equal(parseArgs(['node', 'verify-working-link.cjs', 'https://explicit.example/']).url, 'https://explicit.example/');
  } finally {
    if (preview === undefined) delete process.env[deployIdentity.previewOriginEnvironmentVariable];
    else process.env[deployIdentity.previewOriginEnvironmentVariable] = preview;
    if (canonical === undefined) delete process.env[deployIdentity.canonicalOriginEnvironmentVariable];
    else process.env[deployIdentity.canonicalOriginEnvironmentVariable] = canonical;
  }
});

test('cloudflareIdentityGate hits the exact proof endpoint shape from the identity file', async () => {
  let calledWith = null;
  const originalFetch = globalThis.fetch;
  const runtimeHeader = deployIdentity.runtimeHeader;
  try {
    globalThis.fetch = async (url) => {
      calledWith = url;
      return fakeResponse({
        headers: { [runtimeHeader.name]: runtimeHeader.value },
        body: {
          deploymentProvider: deployIdentity.provider,
          deploymentService: deployIdentity.service,
          deployedRevision: 'sha-live'
        }
      });
    };
    const result = await cloudflareIdentityGate('https://world.example/', 'sha-live');
    const expectedProofUrl = new URL(deployIdentity.proofEndpoint, 'https://world.example/').href;
    assert.equal(calledWith, expectedProofUrl);
    assert.equal(result.proofUrl, expectedProofUrl);
    assert.equal(result.deployedRevision, 'sha-live');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloudflareIdentityGate rejects non-2xx responses', async () => {
  const originalFetch = globalThis.fetch;
  const runtimeHeader = deployIdentity.runtimeHeader;
  try {
    globalThis.fetch = async () => fakeResponse({ ok: false, status: 503 });
    await assert.rejects(
      () => cloudflareIdentityGate('https://world.example/', ''),
      /Cloudflare identity HTTP 503/
    );
    await assert.rejects(
      () => cloudflareIdentityGate('https://world.example/', ''),
      /503/
    );
    void runtimeHeader;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloudflareIdentityGate rejects a missing canonical runtime header', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => fakeResponse({
      headers: { 'x-world-server-config-runtime': 'some-other-runtime' },
      body: {
        deploymentProvider: deployIdentity.provider,
        deploymentService: deployIdentity.service,
        deployedRevision: 'sha-live'
      }
    });
    await assert.rejects(
      () => cloudflareIdentityGate('https://world.example/', ''),
      /Canonical Cloudflare runtime header missing/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloudflareIdentityGate rejects provider/service mismatch', async () => {
  const originalFetch = globalThis.fetch;
  const runtimeHeader = deployIdentity.runtimeHeader;
  try {
    globalThis.fetch = async () => fakeResponse({
      headers: { [runtimeHeader.name]: runtimeHeader.value },
      body: {
        deploymentProvider: 'netlify',
        deploymentService: deployIdentity.service,
        deployedRevision: 'sha-live'
      }
    });
    await assert.rejects(
      () => cloudflareIdentityGate('https://world.example/', ''),
      /Cloudflare deployment identity mismatch/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cloudflareIdentityGate rejects a mismatched expected revision', async () => {
  const originalFetch = globalThis.fetch;
  const runtimeHeader = deployIdentity.runtimeHeader;
  try {
    globalThis.fetch = async () => fakeResponse({
      headers: { [runtimeHeader.name]: runtimeHeader.value },
      body: {
        deploymentProvider: deployIdentity.provider,
        deploymentService: deployIdentity.service,
        deployedRevision: 'sha-old'
      }
    });
    await assert.rejects(
      () => cloudflareIdentityGate('https://world.example/', 'sha-wanted'),
      /Deployed revision mismatch: expected sha-wanted, received sha-old/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('screenshotHasVisualSignal detects contrast and rejects solid color', () => {
  const contrast = makePng(80, 60, (x) => (x < 40 ? [0, 0, 0] : [255, 255, 255]));
  assert.doesNotThrow(() => PNG.sync.read(contrast));
  assert.equal(screenshotHasVisualSignal(contrast), true);

  const solid = makePng(80, 60, () => [128, 128, 128]);
  assert.doesNotThrow(() => PNG.sync.read(solid));
  assert.equal(screenshotHasVisualSignal(solid), false);
});