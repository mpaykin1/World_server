'use strict';
const { performance } = require('node:perf_hooks');

// These three different model families are listed for Workers Free in
// Cloudflare's 2026-07-28 announcement. Never select a paid-only model.
const MODELS = Object.freeze([
  // Real runs showed Gemma hit a 45s timeout while GLM and Nemotron
  // exhausted 2,500 output tokens on reasoning. Try the fast pair first.
  ['z-ai', '@cf/zai-org/glm-4.7-flash'],
  ['nvidia', '@cf/nvidia/nemotron-3-120b-a12b'],
  ['google', '@cf/google/gemma-4-26b-a4b-it']
]);
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
// Never accept a copied curl command, quotes, whitespace, or a pasted example.
// Validate before constructing Authorization headers: Node can include invalid
// header contents in TypeError messages, which must never reach CI artifacts.
// Dedicated Workers AI tokens observed from the Cloudflare REST API start
// with cfut_. A generic header-safe character class is insufficient:
// compacted examples such as curl-HAuthorizationBearer... can match it.
const API_TOKEN = /^cfut_[A-Za-z0-9_-]{20,240}$/;
const MAX_PATCH_BYTES = 18000;
function safeCloudflareError(err) {
  const value = String(err?.message || '');
  const http = /^Cloudflare HTTP ([1-5][0-9]{2})$/.exec(value);
  if (http) return 'Cloudflare HTTP ' + http[1];
  const code = /^Cloudflare API error code=([0-9]{1,12}|unknown)$/.exec(value);
  if (code) return 'Cloudflare API error code=' + code[1];
  if (['Cloudflare credential unavailable', 'Invalid Workers AI token format',
    'Cloudflare review patch too large', 'Unapproved Cloudflare model',
    'Cloudflare response truncated', 'Model did not return valid JSON',
    'Invalid model verdict', 'Missing structured review fields'].includes(value)) return value;
  // Only native aborts and exact expected runtime errors count as timeouts.
  // Upstream provider text must not spoof diagnostics or enter artifacts.
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' ||
      /^(?:The operation was aborted due to timeout|This operation was aborted|Cloudflare request timed out)$/i.test(value)) {
    return 'Cloudflare request timed out';
  }
  return 'Cloudflare request failed (details redacted)';
}
function availableCloudflareModels({ accountId = '', token = '', freePlanConfirmed = false,
  builderModel = '' } = {}) {
  if (freePlanConfirmed !== true || !API_TOKEN.test(token) || !ACCOUNT_ID.test(accountId)) return [];
  return MODELS.filter(([family]) => !builderModel.startsWith(family + '/'))
    .map(([family, id]) => ({ provider: 'cloudflare', family, id }));
}
async function defaultGetJson(url, options, timeoutMs) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error('Cloudflare HTTP ' + response.status);
  return response.json();
}
async function requestCloudflareReview(model, patch, metadata, {
  accountId, token, systemPrompt, parseVerdict, getJson = defaultGetJson
} = {}) {
  const started = performance.now();
  const result = { provider: 'cloudflare', family: model.family, model: model.id };
  try {
    if (!ACCOUNT_ID.test(accountId || '') || !token) throw new Error('Cloudflare credential unavailable');
    if (!API_TOKEN.test(token)) throw new Error('Invalid Workers AI token format');
    if (Buffer.byteLength(patch) > MAX_PATCH_BYTES) throw new Error('Cloudflare review patch too large');
    if (!MODELS.some(([family, id]) => family === model.family && id === model.id)) {
      throw new Error('Unapproved Cloudflare model');
    }
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + model.id;
    const payload = { messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ context: metadata, untrusted_patch: patch }) }
    ], max_completion_tokens: 4096, temperature: 0, stream: false,
    // Cloudflare documents both controls on REST inputs. Null expressly
    // disables reasoning; do not burn the entire token budget on thinking.
    reasoning_effort: null,
    chat_template_kwargs: { enable_thinking: false, clear_thinking: true } };
    const answer = await getJson(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 45000);
    if (answer?.success !== true || !answer?.result) {
      const raw = String(answer?.errors?.[0]?.code ?? 'unknown');
      const code = /^[0-9]{1,12}$/.test(raw) ? raw : 'unknown';
      throw new Error('Cloudflare API error code=' + code);
    }
    const reply = answer.result;
    const choice = reply.choices?.[0];
    const output = reply.response ?? choice?.message?.content;
    const content = Array.isArray(output) ? output.filter(x => x?.type === 'text')
      .map(x => x.text).join('') : output;
    if (choice?.finish_reason === 'length' || reply.finish_reason === 'length') {
      throw new Error('Cloudflare response truncated');
    }
    const review = parseVerdict(content);
    return { ...result, ...review, durationMs: Math.round(performance.now() - started) };
  } catch (err) {
    // Do not log token, request body, or full provider response.
    return { ...result, verdict: 'INCONCLUSIVE', findings: [], falsification_attempts: [],
      reason: safeCloudflareError(err),
      durationMs: Math.round(performance.now() - started) };
  }
}
module.exports = { MODELS, MAX_PATCH_BYTES, API_TOKEN, safeCloudflareError,
  availableCloudflareModels, requestCloudflareReview };
