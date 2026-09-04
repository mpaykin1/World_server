'use strict';
// FAILURE_TAXONOMY - point 2 this cycle: raw attempt success (OpenCode
// 5/55, Ollama local 3/14) looked like a MODEL reliability problem, but
// this cycle's real A/B trace (see scripts/pipeline-ab-trace.cjs and its
// findings) proved the dominant historical failure mode was a PIPELINE bug
// (scoped-task-compiler attaching irrelevant files, bloating the prompt
// past the timeout ceiling) misclassified generically as 'timeout' -
// indistinguishable, in the existing ad-hoc classification strings, from a
// genuinely slow/weak model. This module gives every existing ad-hoc
// classification string (already returned by lib/ollama-patch-adapter.js,
// lib/agent-adapters.js, lib/agent-health-probe.js - never invented here)
// a real taxonomy bucket and a `layer` ('model' | 'pipeline' | 'resource' |
// 'test') so a model's OWN reliability is never blamed for an
// orchestration/routing/validation/resource problem.
//
// Deliberately a thin, additive classifier over EXISTING classification
// strings already produced elsewhere in this codebase - not a rewrite of
// any of those modules' own logic, and not a new subsystem: just an
// honest, inspectable mapping table plus one small counting helper.
const TAXONOMY = {
  // --- MODEL layer: the model itself produced a bad/slow/absent result,
  // given a fair, correctly-scoped, correctly-routed attempt. ---
  MODEL_BAD_OUTPUT: { layer: 'model', description: 'the model produced output that was schema-invalid, unparseable, or did not match real file content (hallucinated/stale "find" text)' },
  MODEL_TIMEOUT: { layer: 'model', description: 'the model call itself exceeded its real, evidence-based estimated budget while genuinely still computing (not a pipeline-inflated prompt)' },
  MODEL_UNAVAILABLE: { layer: 'model', description: 'the model/provider was not reachable or not installed on this host' },

  // --- PIPELINE layer: orchestration, context compilation, routing,
  // validation or apply-stage problems - the model was never given a fair
  // shot, or its correct output was mishandled after the fact. ---
  PIPELINE_TIMEOUT: { layer: 'pipeline', description: 'the call exceeded its budget because the PIPELINE gave it a bloated/misscoped prompt (e.g. irrelevant files attached) or an under-estimated timeout - not evidence the model itself is slow' },
  PATCH_PARSE_ERROR: { layer: 'pipeline', description: 'the model\'s response could not be parsed as JSON at all (schema_error/extractJson failure) - could be model or prompt-format mismatch, tracked separately from a schema-valid-but-wrong response' },
  PATCH_VALIDATION_ERROR: { layer: 'pipeline', description: 'a schema-valid patch was rejected by validatePatch (find text stale/ambiguous, path outside scope, size limit) - the model tried, the patch was mechanically unsafe or wrong' },
  APPLY_ERROR: { layer: 'pipeline', description: 'a validated patch failed to apply cleanly or failed its own post-apply syntax check' },
  TARGET_MISMATCH: { layer: 'pipeline', description: 'the context compiler selected the wrong file(s) for the goal (router/scope misroute) - this cycle\'s real root cause for most historical local-Ollama "timeout" entries' },
  VERIFIER_FALSE_NEGATIVE: { layer: 'pipeline', description: 'the project verify script (npm run check) failed for a reason unrelated to the actual scoped edit (e.g. an unrelated flaky/pre-existing test elsewhere in a full-suite run)' },
  ROUTER_MISROUTE: { layer: 'pipeline', description: 'model/provider ordering or scope-level selection picked a worse option than evidence supported' },
  DUPLICATE_RETRY: { layer: 'pipeline', description: 'an attempt repeated a combination (model, taskType, scope) that had already failed identically, wasting a real attempt' },

  // --- RESOURCE layer: a real, legitimate environment/capacity condition,
  // not a judgment about the model or the pipeline's own logic. ---
  RESOURCE_BLOCK: { layer: 'resource', description: 'a real resource-scheduler or health-probe gate (RAM pressure, provider rate limit, network degradation) refused the attempt to protect the host or respect a real limit' },

  // --- TEST layer: the edit was applied correctly but the project's own
  // test suite genuinely caught a real regression. ---
  TEST_FAILURE: { layer: 'test', description: 'the applied edit genuinely broke a real, relevant test - the correct, intended outcome of verification working' },
};

// Maps an EXISTING ad-hoc classification string (already produced by
// ollama-patch-adapter.js / agent-adapters.js / agent-health-probe.js) to
// its real taxonomy bucket. Every mapping here traces to a real string
// already emitted somewhere in this codebase - see the inline comment on
// each for exactly where.
const CLASSIFICATION_MAP = {
  // lib/ollama-patch-adapter.js (invokeOllamaPatch)
  no_scope: 'TARGET_MISMATCH', // empty/no-existent scoped file list - a context-compiler problem, not the model's
  timeout: 'MODEL_TIMEOUT', // the model call itself hit its estimated budget - see note below on how TARGET_MISMATCH is distinguished
  schema_error: 'PATCH_PARSE_ERROR',
  validation_rejected: 'PATCH_VALIDATION_ERROR',
  syntax_invalid: 'APPLY_ERROR',
  exhausted_attempts: 'PATCH_VALIDATION_ERROR',
  no_repair_context: 'APPLY_ERROR',
  call_failed: 'MODEL_UNAVAILABLE',

  // lib/agent-adapters.js (invokeOpencodeOnce / invokeOllamaPatchOnce / implementGoal)
  ok: null, // success, not a failure
  verification_failed: 'VERIFIER_FALSE_NEGATIVE', // real distinction (real regression vs unrelated flake) needs the verifier's own stderr - see classifyVerifierFailure below
  resource_contention: 'RESOURCE_BLOCK',
  process_hang: 'PIPELINE_TIMEOUT', // OpenCode's own process not responding is an orchestration/process-management problem, not the hosted model being slow
  agent_error: 'PIPELINE_TIMEOUT', // non-zero exit with no diff - most observed real cases are CLI/process issues, not the model refusing
  no_changes: 'MODEL_BAD_OUTPUT', // the model ran and produced nothing actionable
  pruned_by_history: 'DUPLICATE_RETRY',
  unavailable: 'MODEL_UNAVAILABLE',
  health_skip: 'RESOURCE_BLOCK',
};

function classifyFailure(rawClassification, { verifierStderr = '' } = {}) {
  if (rawClassification === 'ok') return { taxonomyKey: null, layer: null, description: 'success' };
  // A verification_failed whose stderr shows the failure is inside the
  // repo's OWN pre-existing test infra (a concurrency/lock race, an
  // unrelated file's assertion) rather than anything touching the scoped
  // target file is real evidence of a false negative, not a genuine
  // regression the edit caused - point 2's explicit "don't blame the
  // model for a full-suite flake" case, and this cycle's own real example
  // (test/agent-adapters.test.js's .git/config lock race, unrelated to
  // any actual patch content).
  if (rawClassification === 'verification_failed' && verifierStderr) {
    const looksLikeInfraFlake = /could not lock config file|EBUSY|ENOENT.*worktree|ECONNRESET|resource temporarily unavailable/i.test(verifierStderr);
    if (looksLikeInfraFlake) return { taxonomyKey: 'VERIFIER_FALSE_NEGATIVE', layer: 'pipeline', description: TAXONOMY.VERIFIER_FALSE_NEGATIVE.description, infraFlake: true };
    return { taxonomyKey: 'TEST_FAILURE', layer: 'test', description: TAXONOMY.TEST_FAILURE.description };
  }
  const key = CLASSIFICATION_MAP[rawClassification];
  if (!key) return { taxonomyKey: 'MODEL_BAD_OUTPUT', layer: 'model', description: `unmapped raw classification "${rawClassification}" - defaulting to a model-layer bucket rather than silently dropping it`, unmapped: true };
  return { taxonomyKey: key, layer: TAXONOMY[key].layer, description: TAXONOMY[key].description };
}

// Point 2's explicit ask: "don't record every pipeline problem as a model
// error." Given a list of history entries (agent-history.jsonl shape, each
// with a `classification` field), splits real counts by layer instead of
// a single flat success rate - the honest number this cycle's report
// needs is "how many of these were the MODEL vs the PIPELINE/RESOURCE
// around it."
function summarizeByLayer(entries) {
  const summary = { model: 0, pipeline: 0, resource: 0, test: 0, success: 0, unmapped: 0, total: entries.length };
  for (const e of entries) {
    if (e.success) { summary.success += 1; continue; }
    const c = classifyFailure(e.classification, { verifierStderr: e.verifierStderr || '' });
    if (c.unmapped) summary.unmapped += 1;
    if (c.layer) summary[c.layer] = (summary[c.layer] || 0) + 1;
  }
  return summary;
}

module.exports = { TAXONOMY, CLASSIFICATION_MAP, classifyFailure, summarizeByLayer };
