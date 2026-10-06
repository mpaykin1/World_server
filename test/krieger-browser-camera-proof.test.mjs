import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-camera-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-camera-browser-proof.py","utf8");
const workflow=fs.readFileSync(".github/workflows/krieger-browser-camera-proof.yml","utf8");

test("camera proof pins Browser mouse movement to native PlayerDir/PlayerLook",()=>{
  assert.match(runner,/sSystem->GetInput\(0,id\)/);
  assert.match(runner,/PlayerDir  \+= \(id\.Analog\[0\] - LastMouseX\)\*f/);
  assert.match(runner,/PlayerLook \+= \(id\.Analog\[1\] - LastMouseY\)\*f/);
  assert.match(runner,/cmd === 'mmove'/);
  assert.match(runner,/Input\.dispatchMouseEvent/);
  assert.match(runner,/__kkWhere=1/);
});

test("camera proof uses A, irrelevant-key N, mouse B and fresh A2",()=>{
  assert.match(runner,/run_phase baseline/);
  assert.match(runner,/run_phase irrelevant-key "key:q"/);
  assert.match(runner,/run_phase moved "mmove:850 420 8"/);
  assert.match(runner,/run_phase restored/);
  assert.match(verifier,/irrelevantKeyNoCameraEffect/);
  assert.match(verifier,/mouseCameraEffectObserved/);
  assert.match(verifier,/restorationExactEnough/);
  assert.match(verifier,/signalToNoise/);
});

test("camera proof stays exact-head, bounded and durable",()=>{
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.match(workflow,/run-supervisor\.cjs --run-id krieger-browser-camera-proof/);
  assert.match(workflow,/--timeout-ms 720000 --stall-ms 120000/);
  assert.match(workflow,/verify-camera-browser-proof\.py --self-test/);
  assert.match(workflow,/camera-proof\.json/);
  assert.match(workflow,/if-no-files-found: error/);
});
