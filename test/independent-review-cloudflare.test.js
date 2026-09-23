'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVerdict, reviewPatch } = require('../scripts/independent-review-gate.cjs');
const { availableCloudflareModels, requestCloudflareReview } =
  require('../scripts/independent-review-cloudflare.cjs');
const cfg = { accountId: 'a'.repeat(32), token: 'cfut_' + 'x'.repeat(40), freePlanConfirmed: true };
const patch = 'diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\n';
const pass = { verdict: 'PASS', findings: [],
  falsification_attempts: ['Reviewed input validation and negative case'] };
test('Cloudflare models need verified Free plan and a separate model family', () => {
  assert.deepEqual(availableCloudflareModels({ ...cfg, freePlanConfirmed: false }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, accountId: 'not-an-id' }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, token: '' }), []);
  const names = availableCloudflareModels(cfg);
  assert.deepEqual(names.map(x => x.family), ['z-ai', 'nvidia', 'google']);
  assert.equal(availableCloudflareModels({ ...cfg, builderModel: 'google/builder' }).length, 2);
});
test('Cloudflare envelope yields real structured model evidence', async () => {
  const model = availableCloudflareModels(cfg).find(x => x.family === 'google');
  let request;
  const result = await requestCloudflareReview(model, patch, {}, {
    ...cfg, systemPrompt: 'Independent adversarial review', parseVerdict,
    getJson: async (url, opts) => {
      request = { url, opts };
      return { success: true, result: { response: JSON.stringify(pass) } };
    }
  });
  assert.equal(result.provider, 'cloudflare');
  assert.equal(result.family, 'google');
  assert.equal(result.verdict, 'PASS');
  assert.equal(JSON.parse(request.opts.body).max_completion_tokens, 4096);
  assert.ok(request.url.includes('ai/run/@cf/google/gemma-4-26b-a4b-it'));
  assert.ok(!request.opts.body.includes(cfg.token));
});
test('Cloudflare 403/paid-only, empty or truncated response cannot approve', async () => {
  const model = availableCloudflareModels(cfg)[0];
  for (const envelope of [
    { success: false, errors: [{ code: 5035 }] },
    { success: true, result: { response: '' } },
    { success: true, result: { choices: [{ finish_reason: 'length',
      message: { content: JSON.stringify(pass) } }] } }
  ]) {
    const result = await requestCloudflareReview(model, patch, {}, {
      ...cfg, systemPrompt: 'review', parseVerdict, getJson: async () => envelope
    });
    assert.equal(result.verdict, 'INCONCLUSIVE');
  }
});
test('two Cloudflare Free families can review without OpenRouter key', async () => {
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '', cloudflare: cfg,
    getCatalog: async () => { throw new Error('Catalog should not be used'); },
    reviewCloudflare: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'PASS');
  assert.deepEqual(report.reviewers.map(x => x.family), ['z-ai', 'nvidia']);
  assert.equal(report.requiresMaintainerDecision, true);
});
test('a Cloudflare BLOCK stops all remaining reviewers', async () => {
  let requests = 0;
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock', cloudflare: cfg,
    reviewCloudflare: async model => {
      requests++;
      return { ...model, verdict: 'BLOCK', findings: [{ severity: 'critical' }],
        falsification_attempts: ['Exploit reproduced'] };
    },
    getCatalog: async () => { throw new Error('Must not call catalog after BLOCK'); }
  });
  assert.equal(report.verdict, 'BLOCK');
  assert.equal(requests, 1);
});
test('same model family on two providers cannot create fake independence', async () => {
  const candidates = { data: [{
    id: 'google/gemma-4-31b-it:free',
    pricing: { prompt: '0', completion: '0' }
  }] };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock',
    cloudflare: cfg, getCatalog: async () => candidates,
    reviewCloudflare: async model => ({ ...model, verdict: model.family === 'google'
      ? 'PASS' : 'INCONCLUSIVE', findings: [], falsification_attempts:
      model.family === 'google' ? ['negative path'] : [] }),
    review: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'INCONCLUSIVE');
});
test('Cloudflare account quota failure switches to OpenRouter without fake PASS', async () => {
  const catalog = { data: ['google/gemma-4-31b-it:free',
    'nvidia/nemotron-3-super-120b-a12b:free'].map(id => ({
      id, pricing: { prompt: '0', completion: '0' }
    })) };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'mock',
    cloudflare: cfg, getCatalog: async () => catalog,
    reviewCloudflare: async model => ({ ...model, verdict: 'INCONCLUSIVE',
      reason: 'Cloudflare HTTP 429', falsification_attempts: [], findings: [] }),
    review: async model => ({ ...model, ...pass })
  });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.reviewers.length, 3);
  assert.equal(report.providerIssues.length, 1);
});

test('copied REST curl command is refused locally before any network request', async () => {
  const secret = 'cfut_' + 'S'.repeat(40);
  const pastedCommand = 'curl "https://api.cloudflare.com" -H "Authorization: Bearer ' + secret + '"';
  const model = { provider: 'cloudflare', family: 'google',
    id: '@cf/google/gemma-4-26b-a4b-it' };
  assert.deepEqual(availableCloudflareModels({ ...cfg, token: pastedCommand }), []);
  let calls = 0;
  const result = await requestCloudflareReview(model, patch, {}, {
    ...cfg, token: pastedCommand, parseVerdict, systemPrompt: 'review',
    getJson: async () => { calls++; throw new Error('must not call provider'); }
  });
  assert.equal(calls, 0);
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.reason, 'Invalid Workers AI token format');
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('unexpected fetch and upstream errors never echo an API key to artifacts', async () => {
  const model = availableCloudflareModels(cfg)[0];
  const probe = 'SENSITIVE_HEADER_MUST_NOT_APPEAR';
  for (const exception of [
    new TypeError('Headers.append: Bearer ' + cfg.token + ' ' + probe),
    new Error('Cloudflare HTTP 403: Authorization ' + cfg.token + ' ' + probe),
    new Error('provider reply ' + probe)
  ]) {
    const result = await requestCloudflareReview(model, patch, {}, {
      ...cfg, systemPrompt: 'review', parseVerdict,
      getJson: async () => { throw exception; }
    });
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert.equal(result.reason, 'Cloudflare request failed (details redacted)');
    assert.ok(!JSON.stringify(result).includes(cfg.token));
    assert.ok(!JSON.stringify(result).includes(probe));
  }
});

test('review report flags malformed Cloudflare token without exposing content', async () => {
  const pasted = 'curl -H "Authorization: Bearer cfut_' + 'Q'.repeat(40) + '"';
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '',
    cloudflare: { ...cfg, token: pasted },
    getCatalog: async () => { throw new Error('should not fetch catalog'); }
  });
  assert.equal(report.verdict, 'INCONCLUSIVE');
  assert.match(report.providerIssues.join(' '), /token malformed/);
  assert.ok(!JSON.stringify(report).includes(pasted));
  assert.equal(report.reviewers.length, 0);
});

test('compact curl command and provider-text prefixes are not Workers AI tokens', async () => {
  const disguised = [
    'curl-HAuthorizationBearer-cfut_' + 'a'.repeat(40),
    'curl-HAuthorizationBearer' + 'a'.repeat(40),
    'Bearer' + 'b'.repeat(48), 'sk_' + 'c'.repeat(42)
  ];
  for (const token of disguised) {
    assert.equal(availableCloudflareModels({ ...cfg, token }).length, 0);
    const review = await requestCloudflareReview(
      { provider: 'cloudflare', family: 'google', id: '@cf/google/gemma-4-26b-a4b-it' },
      patch, {}, { ...cfg, token, systemPrompt: 'review', parseVerdict,
        getJson: async () => { throw new Error('NETWORK MUST NOT BE CALLED'); }
      });
    assert.equal(review.reason, 'Invalid Workers AI token format');
  }
});
test('allowlisted diagnostic text is strictly exact and cannot contain a key', () => {
  const { safeCloudflareError } = require('../scripts/independent-review-cloudflare.cjs');
  const secret = cfg.token;
  assert.equal(safeCloudflareError(new Error('Model did not return valid JSON '+ secret)),
    'Cloudflare request failed (details redacted)');
  assert.equal(safeCloudflareError(new Error('Missing structured review fields '+ secret)),
    'Cloudflare request failed (details redacted)');
});
