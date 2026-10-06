import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("LightLab preserves a causal A/B/A native lighting experiment",()=>{
  const src=read("tools/krieger-total-control/light-lab.mjs");
  assert.match(src,/command\(15,"freeze-time"\)/);
  assert.match(src,/setShadowState\(1,"no-shadows"\)/);
  assert.match(src,/setShadowState\(2,"no-lights"\)/);
  assert.match(src,/setShadowState\(0,"restore"\)/);
  assert.match(src,/nativeLightPathObserved/);
  assert.match(src,/nativeShadowPathObserved/);
  assert.match(src,/dominatesNoise\(shadowEffect,noise\)/);
  assert.match(src,/dominatesNoise\(localLightEffect,noise\)/);
  assert.match(src,/restoreNearBaseline/);
  assert.match(src,/KK_EVIDENCE_SHA/);
});

test("Light VNO workflow is exact-head pinned and bounded",()=>{
  const yml=read(".github/workflows/krieger-light-vno.yml");
  assert.match(yml,/ref:\s*\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(yml,/3bf0ff017372e640e966c2785a4d95a998cec242/);
  assert.match(yml,/version:\s*6\.0\.9/);
  assert.match(yml,/--run-id krieger-light-build/);
  assert.match(yml,/--timeout-ms 600000/);
  assert.match(yml,/--run-id krieger-light-vno/);
  assert.match(yml,/--timeout-ms 300000/);
  assert.match(yml,/KRIEGER_LIGHT_LAB_REPORT\.json/);
});

test("instrumentation exposes observatory controls without replacing renderer",()=>{
  const patch=read("tools/krieger-total-control/patch-forensics.py");
  assert.match(patch,/kkObsCommand/);
  assert.match(patch,/renderer\.frame/);
  assert.match(patch,/gpu\.frame/);
  assert.match(patch,/mainplayer\.master_viewport/);
  assert.match(patch,/weapon\.commit/);
  assert.doesNotMatch(patch,/three\.js|babylon|new WebGLRenderer/i);
});
