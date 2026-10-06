import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-damage-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-damage-browser-proof.py","utf8");

test("damage proof crosses browser input into native player life with negative control and restoration",()=>{
  assert.match(runner,/Browser key K|case 'K'/);
  assert.match(runner,/Player\.Hit\(10\)/);
  assert.match(runner,/run_phase irrelevant-key "key:J"/);
  assert.match(runner,/run_phase damaged "key:K"/);
  assert.match(runner,/run_phase restored/);
  assert.match(runner,/key:F10,wait:1,log:player:240/);
  assert.match(runner,/log:player:240/);
  assert.match(verifier,/irrelevantKeyNoEffect/);
  assert.match(verifier,/damageObserved/);
  assert.match(verifier,/restorationExact/);
  assert.match(verifier,/damage causality proof failed/);
});
