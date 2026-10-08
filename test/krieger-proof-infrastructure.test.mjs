import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("WASM proof pins the last exact-head-proven toolchain and deterministic root-2 harness",()=>{
  const workflow=read(".github/workflows/krieger-wasm-runtime-proof.yml");
  const harness=read("tools/krieger-total-control/run-wasm-runtime-proof.sh");
  assert.match(workflow,/version:\s*6\.0\.11/);
  assert.doesNotMatch(workflow,/emsdk.*(?:install|activate)\s+latest/);
  assert.match(workflow,/run-supervisor\.cjs/);
  assert.match(workflow,/--timeout-ms\s+300000/);
  assert.match(workflow,/--stall-ms\s+60000/);
  assert.match(harness,/append_gl_stub "glPixelStorei"/);
  assert.match(harness,/Document->CurrentRoot = 2/);
  assert.match(harness,/headless proof: root 2 precalc complete/);
  assert.match(harness,/headless proof: init complete root 2/);
});

test("browser proof remains on the same pinned compiler and is bounded",()=>{
  const workflow=read(".github/workflows/krieger-browser-visual-proof.yml");
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.match(workflow,/run-supervisor\.cjs/);
  assert.match(workflow,/--timeout-ms\s+900000/);
  assert.match(workflow,/--stall-ms\s+120000/);
  assert.match(workflow,/--stall-ms\s+120000/);
});

test("Run Supervisor integration preserves current master scripts",()=>{
  const pkg=JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["run:supervise"],"node scripts/run-supervisor.cjs");
  assert.equal(pkg.scripts["mf:check"],"node scripts/check-must-finish.mjs");
  assert.match(pkg.scripts.check,/npm run mf:check/);
});

test("canonical KRIEGER control artifacts are present and fail-closed",()=>{
  for (const p of ["KRIEGER_TOTAL_CONTROL_HANDOFF.md","data/krieger-total-control-evidence-ledger.json","data/krieger-capability-map.json","data/krieger-knowledge-graph.json","docs/krieger-total-control/EVIDENCE_SUMMARY.md","docs/krieger-total-control/KNOWLEDGE_GRAPH.md"]) assert.equal(fs.existsSync(p),true,p);
  const ledger=JSON.parse(read("data/krieger-total-control-evidence-ledger.json"));
  assert.equal(ledger.currentCandidate.ownerVerdict,"UNSET");
  assert.equal(ledger.metricVersion,"krieger-total-control/v2-three-chain-100");
  assert.equal(ledger.policyVersion,"krieger-control-proof/v2-owner-verdict-separated");
  assert.equal(ledger.computed.totalNodes,40);
  const expectedMasterWeight=Object.entries(ledger.scoring.chainWeights).reduce((total,[chain,weight])=>{
    const nodes=ledger.chains[chain];
    const proven=nodes.filter(node=>node.masterStatus==="CONTROL_PROVEN").length;
    return total+(proven/nodes.length)*weight;
  },0);
  assert.equal(ledger.computed.masterWeight,Number(expectedMasterWeight.toFixed(6)));
  assert.ok(ledger.computed.masterWeight>=ledger.migration.sessionBaselineMaster);
  assert.ok(ledger.computed.candidateWeight>=ledger.computed.masterWeight);
  const summary=read("docs/krieger-total-control/EVIDENCE_SUMMARY.md");
  assert.ok(summary.includes(`KRIEGER MASTER — **${ledger.computed.masterWeight.toFixed(2)}%**`));
  assert.ok(summary.includes(`KRIEGER CANDIDATE — **${ledger.computed.candidateWeight.toFixed(2)}%**`));
  assert.match(summary,/Native Authoring chain/);
});
