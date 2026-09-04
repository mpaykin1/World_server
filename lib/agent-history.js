'use strict';
// AGENT_HISTORY - real, file-based (not ML) task/model performance memory.
// Every agent_implement attempt is recorded: {taskType, contextFileCount,
// model, durationMs, success, tokens, costUsd, classification}. Before
// choosing a model order, rankModelsForTask() looks at past attempts with
// a similar taskType and a similar context size and ranks candidate models
// by (success rate desc, then average duration asc) - so a model that
// previously solved similar-sized similar-type tasks quickly is tried
// first next time, instead of always trying the same fixed order. This is
// intentionally simple (bucketed heuristics over a JSONL log), not a
// trained model - a real, inspectable, honest mechanism rather than a
// fabricated "AI picks the best model" claim.
const fs = require('fs');
const path = require('path');

function historyPath(root) {
  return path.join(root, 'data', 'collective-brain', 'runtime', 'agent-history.jsonl');
}

// Heuristic task-type classifier - keyword buckets, not ML. Good enough to
// group "similar" tasks for model-performance comparison; never claims
// more precision than that.
const TASK_TYPE_KEYWORDS = {
  'markup-fix': ['html', 'meta', 'viewport', 'css', 'style', 'class'],
  'test-fix': ['test', 'assert', 'expect', 'failing', 'regression'],
  'config-change': ['json', 'config', 'package.json', 'yaml', 'yml'],
  'script-logic': ['function', 'script', 'bug', 'logic', 'refactor'],
};

function classifyTaskType(goal) {
  const lower = String(goal || '').toLowerCase();
  for (const [type, words] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return type;
  }
  return 'general';
}

function contextSizeBucket(contextFileCount) {
  if (contextFileCount === 'full-repo' || contextFileCount == null) return 'full';
  if (contextFileCount <= 5) return 'small';
  if (contextFileCount <= 20) return 'medium';
  return 'large';
}

function recordAttempt(root, entry) {
  try {
    const fp = historyPath(root);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
    return true;
  } catch { return false; }
}

function readHistory(root, limit = 2000) {
  try {
    const lines = fs.readFileSync(historyPath(root), 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Point 7, this new cycle: "the failure taxonomy must influence ROUTING,
// not just get recorded." A PIPELINE- or RESOURCE-layer failure (a
// context-compiler misroute, a verifier false negative, a real RAM-
// pressure health skip) is not evidence the MODEL is unreliable - it is
// evidence something AROUND the model failed it. Counting it against the
// model's own success rate is exactly the bug this cycle's whole A/B
// trace investigation was about: production "3/14" looked like a model
// problem but was mostly a pipeline one. `failureLayer` (recorded by
// lib/agent-adapters.js via lib/failure-taxonomy.js since this cycle)
// lets every model-reliability function below skip a non-model-layer
// failure entirely - it is neither a success nor a failure for the
// model's own stats, just uninformative about it. Legacy entries with no
// `failureLayer` field (recorded before this cycle) are treated as
// informative (kept, not silently discarded) rather than assumed to be
// pipeline noise - only an EXPLICIT non-model layer is excluded.
function isModelInformative(h) {
  if (h.success) return true;
  if (!h.failureLayer) return true;
  return h.failureLayer === 'model';
}

// Ranks `candidateModels` by past performance on similar (taskType,
// contextSize-bucket) attempts. A model with zero history keeps its
// original relative order (stable sort) rather than being penalized or
// assumed-best - untested models are neither favored nor excluded.
function rankModelsForTask(root, { goal, contextFileCount }, candidateModels) {
  const taskType = classifyTaskType(goal);
  const bucket = contextSizeBucket(contextFileCount);
  const history = readHistory(root).filter((h) => h.taskType === taskType && h.contextBucket === bucket && isModelInformative(h));

  const stats = new Map();
  for (const model of candidateModels) stats.set(model, { attempts: 0, successes: 0, totalDurationMs: 0 });
  for (const h of history) {
    if (!stats.has(h.model)) continue;
    const s = stats.get(h.model);
    s.attempts += 1;
    if (h.success) s.successes += 1;
    s.totalDurationMs += Number(h.durationMs || 0);
  }

  const ranked = candidateModels
    .map((model, originalIndex) => {
      const s = stats.get(model);
      const successRate = s.attempts ? s.successes / s.attempts : null;
      const avgDuration = s.attempts ? s.totalDurationMs / s.attempts : null;
      return { model, successRate, avgDuration, attempts: s.attempts, originalIndex };
    })
    .sort((a, b) => {
      // models with real history and a higher success rate go first
      if (a.successRate !== null && b.successRate !== null && a.successRate !== b.successRate) return b.successRate - a.successRate;
      if (a.successRate !== null && b.successRate === null) return -1;
      if (a.successRate === null && b.successRate !== null) return 1;
      if (a.successRate !== null && b.successRate !== null && a.avgDuration !== b.avgDuration) return a.avgDuration - b.avgDuration;
      return a.originalIndex - b.originalIndex; // stable fallback: original/default order
    });

  return { taskType, contextBucket: bucket, order: ranked.map((r) => r.model), detail: ranked };
}

// Dynamic timeout: scales with real task complexity signals (context size,
// and - once available - past durations for this taskType/bucket) rather
// than one fixed number for every task regardless of size.
function recommendTimeoutMs(root, { goal, contextFileCount }, fallbackMs) {
  const taskType = classifyTaskType(goal);
  const bucket = contextSizeBucket(contextFileCount);
  const history = readHistory(root).filter((h) => h.taskType === taskType && h.contextBucket === bucket && h.success);
  if (history.length >= 3) {
    const durations = history.map((h) => Number(h.durationMs || 0)).filter((d) => d > 0).sort((a, b) => a - b);
    if (durations.length) {
      const p90 = durations[Math.min(durations.length - 1, Math.ceil(durations.length * 0.9) - 1)];
      return Math.max(20000, Math.round(p90 * 1.5)); // real past p90 * safety margin, not a guess
    }
  }
  return fallbackMs;
}

// Point 8 this cycle: real evidence found live - a 9-task benchmark had
// 13/35 raw attempts succeed despite 8/9 real task-level success, because
// the same models kept getting retried on task classes they had already
// shown they can't do. If a specific (model, taskType) combination has
// real evidence of repeated failure, trying it AGAIN first on the next
// similar task wastes a real attempt (and real wall-clock time) before
// falling through to a model that might actually work. Deliberately
// requires several real samples before concluding anything - a single
// unlucky attempt is not evidence a model can't do a task class, and this
// must never silently exclude a model forever (a model version could
// improve, or the earlier failures could have been environmental) - so
// this only prunes the CURRENT call's ordering, it never deletes history
// or blocks a model from ever being explicitly requested again.
function shouldSkipModelForTaskClass(root, { model, taskType, minAttempts = 3, maxSuccessRate = 0 } = {}) {
  const relevant = readHistory(root).filter((h) => h.model === model && h.taskType === taskType && isModelInformative(h));
  if (relevant.length < minAttempts) return { skip: false, reason: 'not enough history yet to conclude anything', attempts: relevant.length };
  const successes = relevant.filter((h) => h.success).length;
  const successRate = successes / relevant.length;
  if (successRate <= maxSuccessRate) return { skip: true, reason: `${successes}/${relevant.length} real attempts succeeded for this exact (model, taskType) combination`, attempts: relevant.length, successRate };
  return { skip: false, reason: `${successes}/${relevant.length} real attempts succeeded - not a reliable-failure pattern`, attempts: relevant.length, successRate };
}

// Point 9 this cycle: the router should not optimize for raw $0 cost
// alone - "a $0 model that takes 4 minutes and almost always fails should
// not automatically beat a $0 model that solves it in 20 seconds." Scores
// P(success) x quality / expected latency / resource cost / monetary
// cost, using real historical evidence for the first two factors (falling
// back to a neutral prior for an untested model, never penalizing it
// below a model with a real track record of failure) and simple, explicit
// weights for the resource/cost factors (LLM_LOCAL is CPU-heavy on this
// host, so it costs more "resource budget" per second than a remote call
// even though both are $0 in money).
const RESOURCE_COST_WEIGHT = { 'ollama-local': 1.4, 'opencode-free': 1.0 }; // local ties up this machine's own CPU; remote does not
function scoreModelForTask(root, { model, taskType, provider, costUsd = 0 } = {}) {
  const relevant = readHistory(root).filter((h) => h.model === model && h.taskType === taskType && isModelInformative(h));
  const successes = relevant.filter((h) => h.success);
  const hasHistory = relevant.length >= 2;
  // Neutral prior for an untested (model, taskType) pair - deliberately
  // not 0 and not 1: an unproven model is neither assumed to fail nor
  // assumed to succeed, matching rankModelsForTask's own "untested models
  // are neither favored nor excluded" principle.
  const pSuccess = hasHistory ? successes.length / relevant.length : 0.5;
  const avgLatencyMs = successes.length ? successes.reduce((a, h) => a + Number(h.durationMs || 0), 0) / successes.length : 60000; // a real, generous neutral prior when nothing succeeded yet to measure
  const resourceWeight = RESOURCE_COST_WEIGHT[provider] || 1.0;
  const moneyWeight = 1 + Number(costUsd || 0) * 1000; // still $0 for both current providers, kept real/explicit for when that stops being true
  const score = pSuccess / (Math.max(1, avgLatencyMs / 1000) * resourceWeight * moneyWeight);
  return { score, pSuccess, avgLatencyMs, resourceWeight, moneyWeight, sampleSize: relevant.length };
}

// Point 6 this cycle: shouldSkipModelForTaskClass's flat "needs >=3 real
// attempts, 0% success" rule is real and safe, but reacts slowly - 2
// strong, recent, back-to-back failures (e.g. the same schema_error twice)
// wait for a 3rd wasted attempt before the pipeline learns anything, and a
// single stale failure from weeks ago counts exactly as much as one from
// five minutes ago. Confidence-weighted evidence fixes both without ever
// banning a model outright from one random failure:
//  - recency-weighted: each entry's vote decays with an exponential half-
//    life (halfLifeDays) - a recent success recovers a model's standing
//    quickly; an old failure fades out instead of permanently counting.
//  - requires a minimum amount of REAL weighted evidence (minWeightedTotal)
//    before concluding anything, not just a high ratio from one sample -
//    this is what stops "1 random failure" from ever triggering a skip
//    on its own, while letting 2 strong recent failures react faster than
//    the old flat minAttempts=3 threshold when the evidence really is
//    that decisive.
// Deliberately does NOT implement cross-task-type similarity transfer
// (borrowing evidence from a "similar" task class) - this cycle has no
// real, measured basis for which task types are actually similar enough
// to share evidence safely, and guessing a similarity weight would be
// exactly the kind of unproven fabrication this whole project's evidence-
// first principle rules out. A future cycle with real comparative data
// could add it.
function evidenceWeightedSkip(root, { model, taskType, minConfidence = 0.75, minWeightedTotal = 1.5, halfLifeDays = 14 } = {}) {
  const relevant = readHistory(root).filter((h) => h.model === model && h.taskType === taskType && isModelInformative(h));
  if (!relevant.length) return { skip: false, confidence: 0, weightedTotal: 0, attempts: 0, reason: 'no history yet' };
  const now = Date.now();
  let weightedFailures = 0, weightedTotal = 0;
  for (const h of relevant) {
    const ageDays = Math.max(0, (now - Date.parse(h.at || 0)) / 86400000);
    const weight = Math.pow(0.5, ageDays / halfLifeDays);
    weightedTotal += weight;
    if (!h.success) weightedFailures += weight;
  }
  const confidence = weightedTotal > 0 ? weightedFailures / weightedTotal : 0;
  const skip = weightedTotal >= minWeightedTotal && confidence >= minConfidence;
  return { skip, confidence, weightedTotal, attempts: relevant.length, reason: skip ? `${(confidence * 100).toFixed(0)}% recency-weighted failure rate over ${weightedTotal.toFixed(1)} weighted samples` : 'insufficient decayed evidence to conclude reliable failure' };
}

module.exports = {
  classifyTaskType, contextSizeBucket, recordAttempt, readHistory, rankModelsForTask, recommendTimeoutMs, historyPath,
  shouldSkipModelForTaskClass, scoreModelForTask, evidenceWeightedSkip, isModelInformative,
};
