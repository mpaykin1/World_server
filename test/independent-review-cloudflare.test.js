'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVerdict, reviewPatch } = require('../scripts/independent-review-gate.cjs');
const { availableCloudflareModels, requestCloudflareReview } =
  require('../scripts/independent-review-cloudflare.cjs');
const cfg = { accountId: 'a'.repeat(32), token: 'dummy', freePlanConfirmed: true };
const patch = 'diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\n';
const pass = { verdict: 'PASS', findings: [],
  falsification_attempts: ['Reviewed input validation and negative case'] };
test('Cloudflare models need verified Free plan and a separate model family', () => {
  assert.deepEqual(availableCloudflareModels({ ...cfg, freePlanConfirmed: false }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, accountId: 'not-an-id' }), []);
  assert.deepEqual(availableCloudflareModels({ ...cfg, token: '' }), []);
  const names = availableCloudflareModels(cfg);
  assert.deepEqual(names.map(x => x.family), ['google', 'z-ai', 'nvidia']);
  assert.equal(availableCloudflareModels({ ...cfg, builderModel: 'google/builder' }).length, 2);
});
test('Cloudflare envelope yields real structured model evidence', async () => {
  const model = availableCloudflareModels(cfg)[0];
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
  assert.ok(request.url.includes('ai/run/@cf/google/gemma-4-26b-a4b-it'));
  assert.ok(!request.opts.body.includes('dummy'));
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
  assert.deepEqual(report.reviewers.map(x => x.family), ['google', 'z-ai']);
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
