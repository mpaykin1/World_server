'use strict';
// MODEL_SUITABILITY
//
// Tracks pass/fail outcomes per (model, capabilityClass) and decides whether a
// model should keep receiving a given task class or be marked unsuitable so the
// router can escalate to a more capable backend. Exists because World_server's
// architecture must not be pinned to one model (qwen3:1.7b's tool-selection miss
// on filesystem-read - see error-prevention-registry.json#anythingllm-small-model-
// tool-selection-miss - is the concrete case this protects against): a model that
// keeps failing narrow, deterministic-routed tasks isn't a config bug to keep
// silently retrying, it's a real suitability signal.
//
// Honest scope note: this module owns the DECISION (is this model still
// trustworthy for this task class, and if not, what's recommended instead). It
// does not itself dispatch to a second backend - no second live backend is wired
// into scripts/anythingllm-task-router.cjs yet, so `pickBackend`'s fallback
// recommendation is currently advisory (surfaced in the result, not auto-executed)
// until a real second backend is integrated.
const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER_PATH = path.join(__dirname, '..', 'data', 'model-suitability-ledger.json');
const WINDOW = 5; // only the last N outcomes per (model, class) inform suitability
const MIN_SAMPLES_BEFORE_JUDGING = 3;
const FAIL_RATE_THRESHOLD = 0.5; // >=50% fail rate over the window marks unsuitable

function loadLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return { entries: {} }; }
}

function saveLedger(ledger, ledgerPath = DEFAULT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}

function key(model, capabilityClass) { return `${model}::${capabilityClass}`; }

function recordOutcome(model, capabilityClass, outcome, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  const k = key(model, capabilityClass);
  if (!ledger.entries[k]) ledger.entries[k] = { model, capabilityClass, history: [] };
  ledger.entries[k].history.push({ outcome, at: opts.at || new Date().toISOString() });
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

module.exports = { recordOutcome, isSuitable, pickBackend, evaluateSuitability, DEFAULT_LEDGER_PATH };
