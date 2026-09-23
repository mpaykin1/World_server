'use strict';
const { performance } = require('node:perf_hooks');

// These three different model families are listed for Workers Free in
// Cloudflare's 2026-07-28 announcement. Never select a paid-only model.
const MODELS = Object.freeze([
  ['google', '@cf/google/gemma-4-26b-a4b-it'],
  ['z-ai', '@cf/zai-org/glm-4.7-flash'],
  ['nvidia', '@cf/nvidia/nemotron-3-120b-a12b']
]);
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const MAX_PATCH_BYTES = 18000;
function availableCloudflareModels({ accountId = '', token = '', freePlanConfirmed = false,
  builderModel = '' } = {}) {
  if (freePlanConfirmed !== true || !token || !ACCOUNT_ID.test(accountId)) return [];
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
    if (Buffer.byteLength(patch) > MAX_PATCH_BYTES) throw new Error('Cloudflare review patch too large');
    if (!MODELS.some(([family, id]) => family === model.family && id === model.id)) {
      throw new Error('Unapproved Cloudflare model');
    }
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + model.id;
    const payload = { messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ context: metadata, untrusted_patch: patch }) }
    ], max_tokens: 2500, temperature: 0, stream: false };
    const answer = await getJson(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 45000);
    if (answer?.success !== true || !answer?.result) {
      const code = answer?.errors?.[0]?.code || 'unknown';
      throw new Error('Cloudflare API error code=' + String(code).slice(0, 20));
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
      reason: String(err.message).slice(0, 130),
      durationMs: Math.round(performance.now() - started) };
  }
}
module.exports = { MODELS, MAX_PATCH_BYTES, availableCloudflareModels,
  requestCloudflareReview };
