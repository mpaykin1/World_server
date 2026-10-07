#!/usr/bin/env node
import fs from "node:fs";

export const LEDGER_PATH = "data/krieger-total-control-evidence-ledger.json";
export const SUMMARY_PATH = "docs/krieger-total-control/EVIDENCE_SUMMARY.md";
export const STATUS = new Set(["UNKNOWN","PARTIAL","TESTED","CONTROL_PROVEN","REGRESSED","BLOCKED"]);

export function computeLedger(ledger) {
  const nodes = [...(ledger?.chains?.graphics || []), ...(ledger?.chains?.gameplay || [])];
  const ids = new Set();
  const errors = [];
  for (const node of nodes) {
    if (!node?.id || ids.has(node.id)) errors.push(`bad/duplicate node id: ${node?.id}`);
    ids.add(node.id);
    if (!STATUS.has(node?.status)) errors.push(`bad status for ${node?.id}: ${node?.status}`);
  }
  if (nodes.length !== 23) errors.push(`expected 23 requested control nodes, got ${nodes.length}`);
  const proven = nodes.filter((node) => node.status === "CONTROL_PROVEN");
  const weight = nodes.length ? proven.length / nodes.length * 100 : 0;
  return { errors, nodes, proven, provenWeight: Number(weight.toFixed(6)) };
}

export function renderSummary(ledger) {
  const c = computeLedger(ledger);
  if (c.errors.length) throw new Error(c.errors.join("; "));
  const row = (node) => `| ${node.label} | ${node.status} | ${String(node.note || "").replace(/\|/g, "\\|")} |`;
  const candidate = ledger.currentCandidate || {};
  return [
    "# KRIEGER Total Control — Evidence Summary",
    "",
    "Canonical source: `data/krieger-total-control-evidence-ledger.json`.",
    "",
    `K = **${c.provenWeight.toFixed(2)}%** (${c.proven.length}/${c.nodes.length} equally weighted requested nodes are CONTROL_PROVEN).`,
    "",
    "Scoring is deliberately fail-closed: PARTIAL and TESTED do not add to K; only CONTROL_PROVEN does.",
    "",
    `Master baseline: \`${ledger.git.masterBaseline}\``,
    `Evidence branch base: \`${ledger.git.evidenceBase}\``,
    `Pinned upstream: \`${ledger.git.pinnedUpstream}\``,
    `PR: #${ledger.git.pr}`,
    "",
    "## Current candidate",
    "",
    `- Branch: \`${candidate.branch || "UNKNOWN"}\``,
    `- Follow-up base head: \`${candidate.followupBaseHead || candidate.builderBaseHead || "UNKNOWN"}\``,
    `- State: **${candidate.state || "UNKNOWN"}**`,
    `- Owner verdict: **${candidate.ownerVerdict || "UNSET"}**`,
    `- Exact-head browser proof: **${candidate.browserProof || "PENDING"}**`,
    `- Exact-head process-tree proof: **${candidate.processTreeProof || "PENDING"}**`,
    "",
    "## Graphics chain",
    "",
    "| Node | Status | Evidence summary |",
    "| --- | --- | --- |",
    ...ledger.chains.graphics.map(row),
    "",
    "## Gameplay chain",
    "",
    "| Node | Status | Evidence summary |",
    "| --- | --- | --- |",
    ...ledger.chains.gameplay.map(row),
    "",
    "## Proven weight",
    "",
    `CONTROL_PROVEN nodes: ${c.proven.map((node) => node.label).join(", ")}.`,
    "",
    `Proven weight: **${c.provenWeight.toFixed(2)}/100**.`,
    "",
    "TESTED nodes do not increase K. Promotion to CONTROL_PROVEN requires explicit owner PASS under the project decision rule.",
    ""
  ].join("\n");
}

const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
const computed = computeLedger(ledger);
if (computed.errors.length) throw new Error(computed.errors.join("; "));
if (
  ledger.computed?.totalNodes !== computed.nodes.length ||
  ledger.computed?.provenNodes !== computed.proven.length ||
  Math.abs(Number(ledger.computed?.provenWeight) - computed.provenWeight) > 1e-6
) throw new Error("ledger computed totals are stale");

const expected = renderSummary(ledger).trimEnd();
if (process.argv.includes("--write")) fs.writeFileSync(SUMMARY_PATH, expected + "\n");
else if (process.argv.includes("--check")) {
  const actual = fs.readFileSync(SUMMARY_PATH, "utf8").trimEnd();
  if (actual !== expected) throw new Error("EVIDENCE_SUMMARY.md does not match canonical ledger");
  console.log(JSON.stringify({
    pass: true,
    totalNodes: computed.nodes.length,
    provenNodes: computed.proven.length,
    provenWeight: computed.provenWeight,
    ownerVerdict: ledger.currentCandidate?.ownerVerdict || "UNSET"
  }));
} else console.log(expected);
