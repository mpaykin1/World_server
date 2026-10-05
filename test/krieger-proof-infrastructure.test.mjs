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
  assert.match(workflow,/--timeout-ms\s+420000/);
  assert.match(workflow,/--stall-ms\s+90000/);
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
  assert.equal(ledger.computed.provenNodes,4);
  assert.equal(ledger.computed.provenWeight,17.391304);
  assert.match(read("docs/krieger-total-control/EVIDENCE_SUMMARY.md"),/K = \*\*17\.39%\*\*/);
});
