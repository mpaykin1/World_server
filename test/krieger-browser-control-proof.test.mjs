import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-control-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-control-browser-proof.py","utf8");
const workflow=fs.readFileSync(".github/workflows/krieger-browser-control-proof.yml","utf8");

test("control proof pins W input through AccelForw into native MoveCollider",()=>{
  assert.match(runner,/case 'w':[\s\S]*case 'W':[\s\S]*AccelForw = AccelForwFactor/);
  assert.match(runner,/case 'w'\|sKEYQ_BREAK/);
  assert.match(runner,/AccelForw = 0/);
  assert.match(runner,/MoveCollider\(Player\.Collider,speed,KCRF_ISPLAYER\)/);
  assert.match(runner,/Input\.dispatchKeyEvent/);
  assert.match(runner,/__kkWhere=1/);
});

test("control proof uses fresh A, irrelevant N, held-W B and A2",()=>{
  assert.match(runner,/run_phase baseline/);
  assert.match(runner,/run_phase irrelevant-key "key:q"/);
  assert.match(runner,/run_phase moved-forward "down:w,wait:1,up:w"/);
  assert.match(runner,/run_phase restored/);
  assert.match(verifier,/irrelevantKeyNoMovement/);
  assert.match(verifier,/forwardMovementObserved/);
  assert.match(verifier,/restorationExactEnough/);
  assert.match(verifier,/signalToNoise/);
});

test("control proof is bounded and exact-head",()=>{
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.match(workflow,/run-supervisor\.cjs --run-id krieger-browser-control-proof/);
  assert.match(workflow,/--timeout-ms 720000 --stall-ms 120000/);
  assert.match(workflow,/verify-control-browser-proof\.py --self-test/);
  assert.match(workflow,/control-proof\.json/);
  assert.match(workflow,/if-no-files-found: error/);
});
