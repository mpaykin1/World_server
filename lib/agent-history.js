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

// Ranks `candidateModels` by past performance on similar (taskType,
// contextSize-bucket) attempts. A model with zero history keeps its
// original relative order (stable sort) rather than being penalized or
// assumed-best - untested models are neither favored nor excluded.
function rankModelsForTask(root, { goal, contextFileCount }, candidateModels) {
  const taskType = classifyTaskType(goal);
  const bucket = contextSizeBucket(contextFileCount);
  const history = readHistory(root).filter((h) => h.taskType === taskType && h.contextBucket === bucket);

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

module.exports = { classifyTaskType, contextSizeBucket, recordAttempt, readHistory, rankModelsForTask, recommendTimeoutMs, historyPath };
