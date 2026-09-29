'use strict';
// Hard guard (CLI): enforces "Codex/paid fallback <= 30% of daily AI-agent
// work" and "never use paid APIs or paid GPU" from the master-goal contract.
//
// Reads the SHARED agent report ledger (state/ai-agent-reports.jsonl) written
// by master-coordinator and the registered adapters, counts real work per
// agent over the last 24h and exits nonzero when the paid-fallback share
// exceeds 30%. A missing/empty ledger is INCONCLUSIVE (exit 0), never a
// fabricated PASS, matching the production-quality fresh-evidence precedent.
//
// Usage: node scripts/check-agent-budget.js [--json]

const fs = require('fs');
const path = require('path');
const { resolveMainTreeRoot } = require('../lib/world-server-paths');
const { analyzeLedger } = require('../lib/agent-budget-guard');

const ledgerPath = process.env.AI_AGENT_REPORTS_PATH || path.join(resolveMainTreeRoot(), 'state', 'ai-agent-reports.jsonl');

let ledgerText = null;
if (process.env.AI_AGENT_REPORTS_PATH || fs.existsSync(ledgerPath)) {
  try {
    ledgerText = fs.readFileSync(ledgerPath, 'utf8');
  } catch {
    ledgerText = null;
  }
}

const jsonOut = process.argv.includes('--json');

function report(summary) {
  if (jsonOut) {
    console.log(JSON.stringify({ ledgerPath, ...summary }, null, 2));
    return;
  }
  console.log(`AI-agent work budget guard`);
  console.log(`Ledger: ${ledgerPath}`);
  if (summary.verdict === 'NO_LEDGER') {
    console.log(`No ledger available; budget check is INCONCLUSIVE (nothing fabricated).`);
    return;
  }
  console.log(`Window: ${summary.windowStartIso} .. ${summary.nowIso} (${summary.windowHours}h)`);
  console.log(`Total work units: ${summary.totalWork} (paid-fallback ${summary.paidWork}, free ${summary.freeWork}, unknown ${summary.unknownWork})`);
  console.log(`Per-agent: ${JSON.stringify(summary.perAgent)}`);
  console.log(`Paid-fallback share: ${summary.paidSharePercent}% (cap ${summary.maxPaidSharePercent}%)`);
  console.log(`Verdict: ${summary.verdict} — ${summary.message}`);
}

if (ledgerText === null) {
  const summary = { verdict: 'NO_LEDGER', ledgerPath };
  report(summary);
  process.exit(0);
}

const summary = analyzeLedger(ledgerText, { nowIso: new Date().toISOString() });
report(summary);
process.exit(summary.verdict === 'BUDGET_EXCEEDED' ? 1 : 0);