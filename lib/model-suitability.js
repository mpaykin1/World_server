'use strict';
// MODEL_SUITABILITY
//
// Tracks pass/fail outcomes AND performance metrics per (model, capabilityClass)
// and picks the best backend among live candidates - not a single hardcoded
// model. Exists because World_server's architecture must not be pinned to one
// model: qwen3:1.7b's tool-selection miss and, later, its 0/3 tool-calling
// completion rate under real thinking-mode/latency constraints (see
// error-prevention-registry.json#anythingllm-small-model-tool-selection-miss and
// #qwen3-thinking-disabled-breaks-tool-call-generation) are the concrete cases
// this protects against: a model that keeps failing a task class isn't a config
// bug to keep silently retrying, it's a real suitability signal that should
// route future work to whichever candidate is actually winning.
//
// data/model-registry.json declares WHICH models are candidates for which
// capability class (what's available); this module decides which of those
// candidates is currently best, from real recorded outcomes (what actually
// works) - the split "extend, don't duplicate, don't hardcode" instructions
// asked for.
const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER_PATH = path.join(__dirname, '..', 'data', 'model-suitability-ledger.json');
const REGISTRY_PATH = path.join(__dirname, '..', 'data', 'model-registry.json');
const WINDOW = 5; // only the last N outcomes per (model, class) inform suitability/scoring
const MIN_SAMPLES_BEFORE_JUDGING = 3;
const FAIL_RATE_THRESHOLD = 0.5; // >=50% fail rate over the window marks unsuitable

function loadLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return { entries: {} }; }
}

function saveLedger(ledger, ledgerPath = DEFAULT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}

function loadRegistry(registryPath = REGISTRY_PATH) {
  try { return JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch { return { models: {} }; }
}

function candidatesFor(capabilityClass, registryPath = REGISTRY_PATH) {
  const reg = loadRegistry(registryPath);
  return Object.entries(reg.models || {})
    .filter(([, m]) => Array.isArray(m.candidateFor) && m.candidateFor.includes(capabilityClass))
    .map(([name]) => name);
}

function key(model, capabilityClass) { return `${model}::${capabilityClass}`; }

// opts may include latencyMs, tokens, cpuLoadPercent - all optional, all purely
// additive to the existing outcome-only history so old callers/tests keep working.
function recordOutcome(model, capabilityClass, outcome, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  const k = key(model, capabilityClass);
  if (!ledger.entries[k]) ledger.entries[k] = { model, capabilityClass, history: [] };
  ledger.entries[k].history.push({
    outcome,
    at: opts.at || new Date().toISOString(),
    latencyMs: typeof opts.latencyMs === 'number' ? opts.latencyMs : undefined,
    tokens: typeof opts.tokens === 'number' ? opts.tokens : undefined,
    cpuLoadPercent: typeof opts.cpuLoadPercent === 'number' ? opts.cpuLoadPercent : undefined,
  });
  ledger.entries[k].history = ledger.entries[k].history.slice(-WINDOW);
  saveLedger(ledger, ledgerPath);
  return evaluateSuitability(ledger.entries[k]);
}

function evaluateSuitability(entry) {
  if (!entry || entry.history.length < MIN_SAMPLES_BEFORE_JUDGING) {
    return { suitable: true, reason: 'insufficient samples - defaulting to suitable', samples: entry ? entry.history.length : 0 };
  }
  const fails = entry.history.filter((h) => h.outcome === 'FAIL' || h.outcome === 'TIMEOUT').length;
  const failRate = fails / entry.history.length;
  const suitable = failRate < FAIL_RATE_THRESHOLD;
  return { suitable, reason: suitable ? `fail rate ${failRate.toFixed(2)} below threshold` : `fail rate ${failRate.toFixed(2)} >= ${FAIL_RATE_THRESHOLD} over last ${entry.history.length} attempts`, samples: entry.history.length, failRate };
}

function isSuitable(model, capabilityClass, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  return evaluateSuitability(ledger.entries[key(model, capabilityClass)]);
}

// scoreBackend(): the real per-dimension numbers behind a suitability verdict -
// success rate, average latency, average tokens - so pickBestBackend's ranking
// is inspectable, not a single opaque number.
function scoreBackend(model, capabilityClass, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  const entry = ledger.entries[key(model, capabilityClass)];
  if (!entry || !entry.history.length) return { model, samples: 0, successRate: null, avgLatencyMs: null, avgTokens: null };
  const h = entry.history;
  const successes = h.filter((x) => x.outcome === 'PASS').length;
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return {
    model,
    samples: h.length,
    successRate: successes / h.length,
    avgLatencyMs: avg(h.filter((x) => typeof x.latencyMs === 'number').map((x) => x.latencyMs)),
    avgTokens: avg(h.filter((x) => typeof x.tokens === 'number').map((x) => x.tokens)),
  };
}

// pickBestBackend(): ranks live CANDIDATES (from data/model-registry.json, or an
// explicit list) by success rate first, latency as tiebreak. An unexplored
// candidate (0 samples) is tried before trusting a partially-explored one with a
// mediocre record, so a genuinely better backend isn't permanently ignored just
// because it hasn't been dispatched yet.
function pickBestBackend(capabilityClass, candidateModels, opts = {}) {
  const candidates = candidateModels && candidateModels.length ? candidateModels : candidatesFor(capabilityClass, opts.registryPath);
  if (!candidates.length) return { backend: null, reason: `no candidates declared for '${capabilityClass}' in model-registry.json`, scores: [] };
  const scores = candidates.map((m) => scoreBackend(m, capabilityClass, opts));
  const unexplored = scores.find((s) => s.samples === 0);
  if (unexplored) return { backend: unexplored.model, reason: 'no recorded data yet for this candidate - exploring before trusting a partial record', scores };
  const ranked = [...scores].sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    const al = a.avgLatencyMs ?? Infinity, bl = b.avgLatencyMs ?? Infinity;
    return al - bl;
  });
  return { backend: ranked[0].model, reason: `best of ${scores.length} explored candidates by success rate then latency`, scores: ranked };
}

// pickBackend(): kept for the single-model escalation use case (is THIS model
// still trustworthy, and if not, what's the first alternative candidate) -
// pickBestBackend is the multi-candidate ranking used by the router's dispatch
// path; this stays for callers that already have one specific model in hand.
function pickBackend(model, capabilityClass, candidates = [], opts = {}) {
  const verdict = isSuitable(model, capabilityClass, opts);
  if (verdict.suitable) return { backend: model, verdict, escalated: false };
  const fallback = candidates.find((c) => c !== model);
  return {
    backend: fallback || model,
    verdict,
    escalated: !!fallback,
    note: fallback
      ? `${model} marked unsuitable for '${capabilityClass}' (${verdict.reason}); recommending escalation to '${fallback}'`
      : `${model} marked unsuitable for '${capabilityClass}' (${verdict.reason}); no alternative backend is currently wired into the router, so it will keep being used - this is the real, current limitation, not a false PASS`,
  };
}

module.exports = { recordOutcome, isSuitable, pickBackend, pickBestBackend, scoreBackend, candidatesFor, evaluateSuitability, DEFAULT_LEDGER_PATH, REGISTRY_PATH };
