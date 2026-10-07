'use strict';
// TOOL_COST_MODEL
//
// Tracks latency/timeout/success history per MCP tool name and ranks tools
// cheapest-first, so the router prefers a targeted operation (read_text_file on
// a known/guessable path, list_directory on the current directory) over an
// expensive recursive scan (search_files across the whole sandbox tree) when
// either would resolve the task.
//
// Why this exists: a live E2E run showed world-server-sandbox-search_files
// failing with "MCP error -32001: Request timed out" on a ~2815-file sandbox
// tree, while world-server-sandbox-list_directory and
// world-server-sandbox-read_text_file both completed quickly and correctly for
// the exact same task. Recursive search is a real, measured cost - not
// something to rediscover per task.
const fs = require('fs');
const path = require('path');

const DEFAULT_LEDGER_PATH = path.join(__dirname, '..', 'data', 'tool-cost-ledger.json');
const WINDOW = 5;

// Seed costs (used until real data accumulates) - 'low' tools operate on a
// single known/targeted path; 'high' tools recursively scan the whole tree.
// This is a starting prior, not a permanent hardcode: scoreTool() below
// prefers real recorded history over the seed the moment any exists.
const SEED_COST = {
  list_directory: 'low',
  read_text_file: 'low',
  read_file: 'low',
  get_file_info: 'low',
  search_files: 'high', // recursive glob scan - observed MCP -32001 timeout on ~2815 files
  directory_tree: 'high', // recursive tree walk, same class of cost as search_files
  edit_file: 'medium',
  write_file: 'medium',
  list_directory_with_sizes: 'medium', // stats every entry, pricier than a plain listing
};

function loadLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  try { return JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); } catch { return { entries: {} }; }
}

function saveLedger(ledger, ledgerPath = DEFAULT_LEDGER_PATH) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
}

// toolName here is the UNPREFIXED name (matches lib/mcp-intent-router.js's
// allowedTools and the raw MCP protocol) - cost is a property of the operation,
// not of which MCP server happens to expose it.
function recordToolOutcome(toolName, outcome, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  if (!ledger.entries[toolName]) ledger.entries[toolName] = { toolName, history: [] };
  ledger.entries[toolName].history.push({ outcome, latencyMs: typeof opts.latencyMs === 'number' ? opts.latencyMs : undefined, at: opts.at || new Date().toISOString() });
  ledger.entries[toolName].history = ledger.entries[toolName].history.slice(-WINDOW);
  saveLedger(ledger, ledgerPath);
}

function scoreTool(toolName, opts = {}) {
  const ledgerPath = opts.ledgerPath || DEFAULT_LEDGER_PATH;
  const ledger = loadLedger(ledgerPath);
  const entry = ledger.entries[toolName];
  if (!entry || !entry.history.length) {
    const seed = SEED_COST[toolName] || 'medium';
    return { toolName, source: 'seed', costClass: seed, samples: 0 };
  }
  const h = entry.history;
  const timeouts = h.filter((x) => x.outcome === 'timeout').length;
  const timeoutRate = timeouts / h.length;
  const latencies = h.filter((x) => typeof x.latencyMs === 'number').map((x) => x.latencyMs);
  const avgLatencyMs = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  // Real data overrides the seed once we have any - a tool the seed calls
  // "high" cost that's actually been fast and reliable in practice should not
  // stay permanently deprioritized, and vice versa.
  const costClass = timeoutRate >= 0.5 ? 'high' : timeoutRate > 0 || (avgLatencyMs && avgLatencyMs > 30000) ? 'medium' : 'low';
  return { toolName, source: 'measured', costClass, samples: h.length, timeoutRate, avgLatencyMs };
}

const COST_ORDER = { low: 0, medium: 1, high: 2 };

// rankToolsByCost(): sorts UNPREFIXED tool names cheapest-first. Stable for
// equal cost class (preserves the input order among ties) so callers with a
// meaningful default order (e.g. "prefer read over search") aren't scrambled.
function rankToolsByCost(toolNames, opts = {}) {
  return toolNames
    .map((name, index) => ({ name, index, score: scoreTool(name, opts) }))
    .sort((a, b) => COST_ORDER[a.score.costClass] - COST_ORDER[b.score.costClass] || a.index - b.index)
    .map((x) => x.name);
}

module.exports = { recordToolOutcome, scoreTool, rankToolsByCost, SEED_COST, DEFAULT_LEDGER_PATH };
