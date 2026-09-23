'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectedModels, parseVerdict, aggregate, preflightPatch, reviewPatch, requestReview } =
  require('../scripts/independent-review-gate.cjs');

const candidates = { data: [
  { id: 'qwen/qwen3-coder:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'z-ai/glm-5.2:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'nvidia/nemotron-3.5-lightning:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0.1', completion: '0' } }
]};
const patch = 'diff --git a/lib/example.js b/lib/example.js\n@@ -1 +1 @@\n-return false;\n+return true;\n';
const good = { verdict: 'PASS', findings: [], falsification_attempts: ['Checked negative inputs'] };

test('selects two distinct zero-cost model families, excludes builder', () => {
  assert.deepEqual(selectedModels(candidates, 'qwen/qwen3-coder:free').map(x => x.family), ['z-ai', 'nvidia']);
  assert.equal(selectedModels({ data: [candidates.data[0], candidates.data[3]] }).length, 1);
  assert.equal(selectedModels({ data: [{ id: 'z-ai/glm-5.2:free', pricing: { prompt: '0', completion: '0.00001' } }] }).length, 0);
});
test('rejects malformed model response and empty falsification evidence', () => {
  assert.throws(() => parseVerdict('I approve'), /valid JSON/);
  assert.equal(parseVerdict('I checked invariants.\\n```json\\n' + JSON.stringify(good) + '\\n```').verdict, 'PASS');
  assert.throws(() => parseVerdict(JSON.stringify({ verdict: 'PASS' })), /Missing/);
  assert.equal(aggregate([{ family: 'z-ai', ...good }, { family: 'nvidia', verdict: 'PASS',
    findings: [], falsification_attempts: [] }]), 'INCONCLUSIVE');
});
test('a blocker finding overrides contradictory PASS verdict', () => {
  const review = parseVerdict(JSON.stringify({ verdict: 'PASS', findings: [
    { file: 'lib/example.js', line: 3, severity: 'critical', evidence: 'race', reproduction: 'concurrent writes' }
  ], falsification_attempts: ['race'] }));
  assert.equal(review.verdict, 'BLOCK');
});
test('one BLOCK vetoes, family duplication is inconclusive', () => {
  assert.equal(aggregate([{ family: 'z-ai', ...good }, { family: 'nvidia', ...good, verdict: 'BLOCK' }]), 'BLOCK');
  assert.equal(aggregate([{ family: 'z-ai', ...good }, { family: 'z-ai', ...good }]), 'INCONCLUSIVE');
});
test('never sends a binary, oversized, empty or apparent secret-bearing patch', () => {
  assert.match(preflightPatch(''), /No changes/);
  assert.match(preflightPatch('Binary files a and b differ'), /Binary/);
  assert.match(preflightPatch('x'.repeat(96001)), /exceeds/);
  assert.match(preflightPatch('+const token = "ghp_' + 'a'.repeat(36) + '";'), /secret/);
  assert.equal(preflightPatch(patch), null);
});
test('no reviewer credential fails closed, with content-addressed evidence', async () => {
  const report = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: '' });
  assert.equal(report.verdict, 'INCONCLUSIVE');
  assert.equal(report.reviewers.length, 0);
  assert.match(report.diffSha256, /^[a-f0-9]{64}$/);
});
test('two independent PASS results may pass but still require maintainer', async () => {
  const report = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'dummy',
    getCatalog: async () => candidates,
    review: async model => ({ model: model.id, family: model.family, ...good })
  });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.requiresMaintainerDecision, true);
  assert.equal(report.reviewers.length, 2);
});
test('reviewer outage and partial availability fail closed; no paid fallback', async () => {
  const outage = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'dummy',
    getCatalog: async () => { throw new Error('429'); } });
  assert.equal(outage.verdict, 'INCONCLUSIVE');
  const partial = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'dummy',
    getCatalog: async () => ({ data: [candidates.data[1]] }) });
  assert.match(partial.blockers.join(' '), /Two independent/);
  const rejected = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'dummy',
    builderModel: 'qwen/qwen3-coder:free',
    getCatalog: async () => candidates,
    review: async model => ({ model: model.id, family: model.family,
      verdict: model.family === 'z-ai' ? 'INCONCLUSIVE' : 'PASS',
      findings: [], falsification_attempts: ['timeout check'] }) });
  assert.equal(rejected.verdict, 'INCONCLUSIVE');
});

test('prefers structured-output free model families when advertised', () => {
  const live = { data: [
    { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0', completion: '0' },
      supported_parameters: ['response_format'] },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', pricing: { prompt: '0', completion: '0' },
      supported_parameters: ['response_format'] }
  ] };
  const selected = selectedModels(live, 'qwen/qwen3-coder:free');
  assert.deepEqual(selected.map(x => x.family), ['google', 'nvidia']);
  assert.ok(selected.every(x => x.supportsJson));
});
test('unavailable first reviewer can be replaced by another independent free family', async () => {
  const live = { data: [...candidates.data,
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', pricing: { prompt: '0', completion: '0' },
      supported_parameters: ['response_format'] },
    { id: 'cohere/north-mini-code:free', pricing: { prompt: '0', completion: '0' } }] };
  const report = await reviewPatch({
    patch, base: 'a'.repeat(40), head: 'b'.repeat(40), key: 'dummy',
    builderModel: 'qwen/qwen3-coder:free',
    getCatalog: async () => live,
    review: async model => ({ model: model.id, family: model.family,
      verdict: model.family === 'nvidia' ? 'INCONCLUSIVE' : 'PASS',
      findings: [], falsification_attempts: model.family === 'nvidia' ? [] : ['Counterexample search'] })
  });
  assert.equal(report.verdict, 'PASS');
  assert.equal(report.reviewers.length, 3);
  assert.equal(report.requiresMaintainerDecision, true);
});

test('a transient 429 retries without inventing a PASS', async () => {
  let calls = 0, slept = 0;
  const result = await requestReview({ id: 'google/gemma-4-31b-it:free', family: 'google', supportsJson: true },
    patch, { base: 'a'.repeat(40), head: 'b'.repeat(40) }, 'mock', {
      requestJson: async () => {
        calls++;
        if (calls === 1) throw new Error('Provider HTTP 429');
        return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(good) } }] };
      },
      sleep: async () => { slept++; }
    });
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
  assert.equal(slept, 1);
});
test('provider timeout or truncated answer cannot approve a patch', async () => {
  const model = { id: 'nvidia/nemotron-3-super-120b-a12b:free', family: 'nvidia' };
  const timeout = await requestReview(model, patch, {}, 'mock', {
    requestJson: async () => { throw new Error('The operation was aborted due to timeout'); }
  });
  const truncated = await requestReview(model, patch, {}, 'mock', {
    requestJson: async () => ({ choices: [{ finish_reason: 'length', message: { content: JSON.stringify(good) } }] })
  });
  assert.equal(timeout.verdict, 'INCONCLUSIVE');
  assert.equal(truncated.verdict, 'INCONCLUSIVE');
});
test('supported reasoning model reserves room for visible review JSON', async () => {
  const model = { id: 'nvidia/nemotron-3-super-120b-a12b:free',
    family: 'nvidia', supportsJson: true, supportsReasoning: true,
    reasoning: { mandatory: false, default_enabled: true, supports_max_tokens: true } };
  let sent;
  const result = await requestReview(model, patch, {}, 'mock', {
    requestJson: async (_url, options) => {
      sent = JSON.parse(options.body);
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(good) } }] };
    }
  });
  assert.equal(result.verdict, 'PASS');
  assert.equal(sent.max_tokens, 4200);
  assert.deepEqual(sent.reasoning, { max_tokens: 1024 });
  assert.deepEqual(sent.response_format, { type: 'json_object' });
});

test('empty reasoning answer retries without format constraint, never fake PASS', async () => {
  const model = { id: 'cohere/north-mini-code:free', family: 'cohere',
    supportsReasoning: true, supportsJson: true, reasoning: { mandatory: false } };
  const requests = [];
  const result = await requestReview(model, patch, {}, 'mock', {
    requestJson: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return requests.length === 1
        ? { choices: [{ finish_reason: 'length', message: { content: '' } }] }
        : { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(good) } }] };
    }
  });
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.attempts, 2);
  assert.deepEqual(requests[0].reasoning, { enabled: false });
  assert.equal(requests[0].response_format.type, 'json_object');
  assert.equal(requests[1].response_format, undefined);
  assert.equal(requests[1].max_tokens, 6000);
});
test('HTTP 200 provider error is inconclusive, not approval', async () => {
  const result = await requestReview({ id: 'nvidia/test:free', family: 'nvidia' },
    patch, {}, 'mock', { requestJson: async () => ({ error: { code: 'quota_exceeded' } }) });
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.reason, 'Reviewer request failed (details redacted)');
});

test('two independent 429s stop exhausting a shared free account allowance', async () => {
  const catalog = { data: [
    { id: 'google/gemma-4-31b-it:free', pricing: { prompt: '0', completion: '0' } },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', pricing: { prompt: '0', completion: '0' } },
    { id: 'z-ai/glm-5.2:free', pricing: { prompt: '0', completion: '0' } }
  ] };
  let calls = 0;
  const report = await reviewPatch({ patch, base: 'a'.repeat(40), head: 'b'.repeat(40),
    key: 'mock', getCatalog: async () => catalog,
    review: async model => {
      calls++;
      return { ...model, verdict: 'INCONCLUSIVE',
        reason: 'Provider HTTP 429', findings: [], falsification_attempts: [] };
    }
  });
  assert.equal(calls, 2);
  assert.equal(report.verdict, 'INCONCLUSIVE');
  assert.match(report.providerIssues.join(' '), /shared-key retries/);
});

test('OpenRouter header errors cannot leak credentials into CI evidence', async () => {
  const credential = 'sk_' + 'S'.repeat(38);
  const model = { id: 'google/gemma-4-31b-it:free', family: 'google' };
  const result = await requestReview(model, patch, {}, credential, {
    requestJson: async () => {
      throw new TypeError('Headers.append: invalid value Bearer ' + credential);
    }
  });
  assert.equal(result.verdict, 'INCONCLUSIVE');
  assert.equal(result.reason, 'Reviewer request failed (details redacted)');
  assert.ok(!JSON.stringify(result).includes(credential));
});

test('OpenRouter model-controlled error suffixes are never reported', async () => {
  const credential = 'sk_' + 'R'.repeat(40);
  for (const prefix of ['Model did not return valid JSON',
    'Missing structured review fields']) {
    const result = await requestReview(
      { id: 'google/gemma-4-31b-it:free', family: 'google' }, patch, {}, credential,
      { requestJson: async () => { throw new Error(prefix + ' ' + credential); } });
    assert.equal(result.verdict, 'INCONCLUSIVE');
    assert.equal(result.reason, 'Reviewer request failed (details redacted)');
    assert.ok(!JSON.stringify(result).includes(credential));
  }
});

test('preflight refuses OpenRouter and Workers AI secret-bearing added diff lines', () => {
  for (const credential of [
    'sk_' + 'A'.repeat(42),
    'sk-' + 'B'.repeat(42),
    'cfut_' + 'C'.repeat(42),
    'ghp_' + 'D'.repeat(42)
  ]) {
    const reason = preflightPatch('diff --git a/foo b/foo\n@@ -0,0 +1 @@\n+' + credential + '\n');
    assert.equal(reason, 'Possible secret in diff; do not send to external model');
    assert.ok(!reason.includes(credential));
  }
});
test('review diagnostics do not echo provider-controlled secret-bearing errors', async () => {
  const secret = 'cfut_' + 'S'.repeat(40);
  for (const msg of ['Provider HTTP 403: ' + secret, 'Missing structured review fields ' + secret]) {
    const result = await requestReview({id: 'google/gemma-4-31b-it:free',family:'google'},
      patch, {}, 'mock', {requestJson:async () => {throw new Error(msg)}});
    assert.equal(result.reason,'Reviewer request failed (details redacted)');
  }
});

test('unsupported BLOCK is inconclusive rather than an ungrounded veto or PASS', () => {
  for (const payload of [
    { verdict: 'BLOCK', findings: [], falsification_attempts: ['guess'] },
    { verdict: 'BLOCK', findings: [{ file: 'lib/a.js', line: '2',
      severity: 'high', evidence: 'something might fail', reproduction: '' }],
      falsification_attempts: ['not reproduced'] },
    { verdict: 'PASS', findings: [{ file: 'lib/a.js', line: '2',
      severity: 'high', evidence: 'possibly wrong', reproduction: '' }],
      falsification_attempts: ['not reproduced'] }
  ]) {
    assert.equal(parseVerdict(JSON.stringify(payload)).verdict, 'INCONCLUSIVE');
  }
  const documented = { verdict: 'BLOCK', findings: [{ file: 'lib/a.js', line: '2',
    severity: 'high', evidence: 'This exact input reaches an unsafe branch',
    reproduction: 'Run node test/repro.js and observe failure' }],
    falsification_attempts: ['Negative input reproduced'] };
  assert.equal(parseVerdict(JSON.stringify(documented)).verdict, 'BLOCK');
});
