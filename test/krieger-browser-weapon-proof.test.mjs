import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runner=fs.readFileSync("tools/krieger-total-control/run-browser-weapon-proof.sh","utf8");
const verifier=fs.readFileSync("tools/krieger-total-control/verify-weapon-browser-proof.py","utf8");
const workflow=fs.readFileSync(".github/workflows/krieger-browser-weapon-proof.yml","utf8");

test("weapon proof pins the real native FireKey -> ammo -> FireShot call flow",()=>{
  assert.match(runner,/case sKEY_CTRLR:[\s\S]*case sKEY_MOUSEL:[\s\S]*Player\.FireKey = 1/);
  assert.match(runner,/Player\.Ammo\[Player\.CurrentWeapon\/2\]--/);
  assert.match(runner,/FireShot\(kenv,Player\.CurrentWeapon,0,0\)/);
  assert.match(runner,/static sS8 weaponswap\[8\] = \{-1,0,1,2,4,6,-1,-1\}/);
  assert.match(runner,/\[kk-weapon\] shot=%d weapon=%d ammo=%d/);
  assert.match(runner,/\[kk-weapon\] state current=%d next=%d ammo0=%d fire=%d shots=%d/);
});

test("weapon proof uses fresh A/N/B/A2 browser sessions with an irrelevant control",()=>{
  assert.match(runner,/run_phase baseline/);
  assert.match(runner,/run_phase irrelevant-key "key:q"/);
  assert.match(runner,/run_phase fired "mdown:512 384,wait:0\.2,mup:512 384"/);
  assert.match(runner,/run_phase restored/);
  assert.match(runner,/focus,key:2,wait:3/);
  assert.match(runner,/key:F10,wait:1,log:kk-weapon:120/);
  assert.match(verifier,/irrelevantKeyNoEffect/);
  assert.match(verifier,/ammoDecrementExact/);
  assert.match(verifier,/nativeFireShotObserved/);
  assert.match(verifier,/restorationExact/);
  assert.match(verifier,/ammo-only false positive accepted without FireShot/);
});

test("weapon proof is exact-head, bounded, and durably uploads proof artifacts",()=>{
  assert.match(workflow,/version:\s*6\.0\.9/);
  assert.match(workflow,/run-supervisor\.cjs --run-id krieger-browser-weapon-proof/);
  assert.match(workflow,/--timeout-ms 720000 --stall-ms 120000/);
  assert.match(workflow,/verify-weapon-browser-proof\.py --self-test/);
  assert.match(workflow,/weapon-proof\.json/);
  assert.match(workflow,/if-no-files-found: error/);
});
