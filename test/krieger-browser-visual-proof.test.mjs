import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("tools/krieger-total-control/run-browser-visual-proof.sh","utf8");
const docs=fs.readFileSync("docs/krieger-total-control/BROWSER_VISUAL_PROOF.md","utf8");

test("browser proof uses a bounded non-occluding authored object",()=>{
  assert.match(source,/"position":\[1\.25,0,-4\]/);
  assert.match(source,/"scale":\[0\.6,0\.6,0\.6\]/);
  assert.doesNotMatch(source,/"scale":\[3,3,3\]/);
});

test("browser proof fails closed on RGB/visibility regressions",()=>{
  assert.match(source,/difference\(a\.convert\("RGB"\),b\.convert\("RGB"\)\)/);
  assert.match(source,/visibility_retention>=0\.60/);
  assert.match(source,/mean>=0\.5/);
  assert.match(source,/raise SystemExit\("browser visual proof failed:/);
  assert.match(source,/"browserWebGLProof":pass_gate/);
});

test("known pointer-lock debt is documented without becoming owner success",()=>{
  assert.match(docs,/WrongDocumentError/);
  assert.match(docs,/retain at least 60%/);
  assert.match(docs,/Human\/owner PASS is still required/);
});