import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("WASM proof pins Emscripten 6.0.9 and never tracks latest",()=>{
  const workflow=read(".github/workflows/krieger-wasm-runtime-proof.yml");
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.doesNotMatch(workflow,/emsdk.*(?:install|activate)\s+latest/);
  assert.match(workflow,/run-supervisor\.cjs/);
  assert.match(workflow,/--timeout-ms\s+300000/);
  assert.match(workflow,/--stall-ms\s+60000/);
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
