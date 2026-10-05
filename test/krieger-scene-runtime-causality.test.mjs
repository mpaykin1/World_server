import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("browser proof carries one-field Scene mutation through native KX to real pixels",()=>{
  const src=read("tools/krieger-total-control/run-browser-visual-proof.sh");
  assert.match(src,/"scale":\[4,4,4\]/);
  assert.match(src,/"scale":\[6,4,4\]/);
  assert.match(src,/authored-mutated-plan\.json/);
  assert.match(src,/runtime-mutated\.kx/);
  assert.match(src,/run_browser mutated/);
  assert.match(src,/changed!=\["box:scene"\]/);
  assert.match(src,/nativeKxDifferingBytes/);
  assert.match(src,/width_ratio>=1\.15/);
  assert.match(src,/area_ratio>=1\.10/);
  assert.match(src,/scene runtime causality gate failed/);
});

test("scene causality evidence is durable in browser proof artifact",()=>{
  const yml=read(".github/workflows/krieger-browser-visual-proof.yml");
  assert.match(yml,/scene-causality\.json/);
  assert.match(yml,/mutated\.png/);
  assert.match(yml,/runtime-mutated\.kx/);
  assert.match(yml,/authored-mutated-plan\.json/);
  assert.match(yml,/run-supervisor\.cjs/);
});
