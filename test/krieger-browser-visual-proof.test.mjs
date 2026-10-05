import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("tools/krieger-total-control/run-browser-visual-proof.sh","utf8");
const docs=fs.readFileSync("docs/krieger-total-control/BROWSER_VISUAL_PROOF.md","utf8");
const attach=fs.readFileSync("tools/krieger-total-control/kx-runtime-root-attach.mjs","utf8");
const materialize=fs.readFileSync("tools/krieger-total-control/kx-visual-materialize.mjs","utf8");

test("browser proof uses a bounded non-occluding authored object",()=>{
  assert.match(source,/"position":\[0,0,-2\]/);
  assert.match(source,/"scale":\[4,4,4\]/);
  assert.doesNotMatch(source,/"scale":\[3,3,3\]/);
  assert.match(source,/kx-visual-materialize\.mjs/);
});

test("material bridge selects a bright reachable donor without inventing a new renderer",()=>{
  assert.match(materialize,/logicalU32\(material,53\)/);
  assert.match(materialize,/ambientBrightness/);
  assert.match(materialize,/donorMaterialSelectedByBrightReachableAmbient:true/);
  assert.match(materialize,/operatorId:0x96/);
});

test("browser proof fails closed on RGB/visibility regressions",()=>{
  assert.match(source,/difference\(a\.convert\("RGB"\),b\.convert\("RGB"\)\)/);
  assert.match(source,/visibility_retention>=0\.60/);
  assert.match(source,/strongDifferenceComponentPixels/);
  assert.match(source,/userNoticeabilityScore/);
  assert.match(source,/noticeability>=85\.0/);
  assert.match(source,/raise SystemExit\("browser visual proof failed:/);
  assert.match(source,/"browserWebGLProof":pass_gate/);
});

test("known pointer-lock debt is documented without becoming owner success",()=>{
  assert.match(docs,/WrongDocumentError/);
  assert.match(docs,/retain at least 60%/);
  assert.match(docs,/Human\/owner PASS is still required/);
});
test("runtime attachment replaces the existing root Viewport instead of overlaying a second root",()=>{
  assert.match(attach,/viewportInputSlot=oldRootOp\.inputs\.indexOf\(template\.index\)/);
  assert.match(attach,/rootInputs\[viewportInputSlot\]=viewportIndex/);
  assert.match(attach,/operatorId:oldRootOp\.realId/);
  assert.match(attach,/originalRuntimeRootClonedWithViewportReplacement:true/);
  assert.doesNotMatch(attach,/inputs:\[oldRoot,viewportIndex\]/);
});