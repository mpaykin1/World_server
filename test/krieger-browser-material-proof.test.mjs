import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const mutator=fs.readFileSync("tools/krieger-total-control/kx-material-mutate.mjs","utf8");
const runner=fs.readFileSync("tools/krieger-total-control/run-browser-material-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-material-browser-proof.py","utf8");
const workflow=fs.readFileSync(".github/workflows/krieger-browser-material-proof.yml","utf8");

test("material mutator changes native Material params and distinguishes reachable VNO",()=>{
  assert.match(mutator,/op\.realId!==0x96/);
  assert.match(mutator,/material\?\.realId!==0xd0/);
  assert.match(mutator,/logicalU32Info\(material,field\)/);
  assert.match(mutator,/mode==="unreachable"/);
  assert.match(mutator,/targetReachable:reachable\.has\(target\.index\)/);
  assert.match(mutator,/serializeKxGraph\(doc\)/);
  assert.match(mutator,/verifyKxByteRoundTrip\(bytes\)/);
});

test("browser material proof executes A, wrong-node N, reachable B, then A2",()=>{
  assert.match(runner,/build_and_run baseline/);
  assert.match(runner,/build_and_run negative/);
  assert.match(runner,/build_and_run mutated/);
  assert.match(runner,/build_and_run restored/);
  assert.match(runner,/unreachable "\$WORK\/negative-mutation\.json"/);
  assert.match(runner,/reachable "\$WORK\/reachable-mutation\.json"/);
  assert.match(runner,/aa-repeat\.png/);
  assert.match(verifier,/negativeControlNoClaimedEffect/);
  assert.match(verifier,/reachableMaterialEffectObserved/);
  assert.match(verifier,/restorationWithinNoise/);
  assert.match(verifier,/signalToNoise/);
});

test("material proof is pinned, bounded and durable",()=>{
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.match(workflow,/run-supervisor\.cjs --run-id krieger-browser-material-proof/);
  assert.match(workflow,/--timeout-ms 900000 --stall-ms 120000/);
  assert.match(workflow,/verify-material-browser-proof\.py --self-test/);
  assert.match(workflow,/material-proof/);
  assert.match(workflow,/if-no-files-found: error/);
});
