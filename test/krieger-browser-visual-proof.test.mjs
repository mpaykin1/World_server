import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("tools/krieger-total-control/run-browser-visual-proof.sh","utf8");
const docs=fs.readFileSync("docs/krieger-total-control/BROWSER_VISUAL_PROOF.md","utf8");
const attach=fs.readFileSync("tools/krieger-total-control/kx-runtime-root-attach.mjs","utf8");
const materialize=fs.readFileSync("tools/krieger-total-control/kx-visual-materialize.mjs","utf8");
const normalVerifier=fs.readFileSync("tools/krieger-total-control/verify-normal-browser-proof.py","utf8");
const normalPatcher=fs.readFileSync("tools/krieger-total-control/patch-normal-browser-proof.py","utf8");
const workflow=fs.readFileSync(".github/workflows/krieger-browser-visual-proof.yml","utf8");


test("browser proof keeps CI WebGL on documented SwiftShader flags without forcing Chromium Vulkan",()=>{
  assert.match(source,/--use-gl=angle/);
  assert.match(source,/--use-angle=swiftshader/);
  assert.match(source,/--enable-unsafe-swiftshader/);
  assert.match(source,/upstream cdp Vulkan flag drift/);
  assert.match(source,/forced Chromium Vulkan feature survived proof launcher patch/);
  assert.match(source,/old_vulkan=.*--enable-features=Vulkan/);
  assert.match(source,/new_vulkan=.*--disable-features=CalculateNativeWinOcclusion/);
});

test("browser proof advances each native root with bounded state-driven input",()=>{
  assert.match(source,/start,wait:16,focus,advance:CurrentRoot=1:Return:3:5,advance:CurrentRoot=2:Return:3:5/);
  assert.match(source,/upstream cdp key handler drift/);
  assert.match(source,/advance expects pattern:key:attempts:waitSeconds/);
  assert.match(source,/if \(!reached\) throw new Error\('advance \/'/);
  assert.match(source,/CurrentRoot=2 remains mandatory/);
});

test("browser proof uses a bounded non-occluding authored object",()=>{
  assert.match(source,/"position":\[0,0,-2\]/);
  assert.match(source,/"scale":\[18,11,11\]/);
  assert.doesNotMatch(source,/"scale":\[12,12,12\]/);
  assert.match(source,/kx-visual-materialize\.mjs/);
});

test("material bridge selects a bright reachable donor without inventing a new renderer",()=>{
  assert.match(materialize,/logicalU32\(material,53\)/);
  assert.match(materialize,/ambientBrightness/);
  assert.match(materialize,/donorMaterialSelectedByBrightReachableAmbient:true/);
  assert.match(materialize,/operatorId:0x96/);
});

test("browser proof fails closed on RGB/visibility regressions",()=>{
  assert.match(source,/difference\(rgb_a,rgb_b\)/);
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

test("browser proof includes an immediate same-session A/A control and capability-OFF ablation",()=>{
  assert.match(source,/label" = "capability-off"/);
  assert.match(source,/aa-repeat\.png/);
  assert.match(source,/sameSessionAaNegativeControl/);
  assert.match(source,/capabilityOffUsesOriginalKx/);
  assert.match(source,/mean>=max\(1\.0,aa_mean\*5\.0\)/);
  assert.match(source,/authored effect did not exceed same-session A\/A noise/);
  assert.match(source,/open\(sys\.argv\[4\],\"w\"\)/);
});

test("buffer proof crosses the native EngMesh boundary and requires A/B/A restoration",()=>{
  assert.match(source,/GameRecipe\.tessellate -> Mesh_Cube bytes -> GenMesh -> EngMesh::FromGenMesh -> FillVertexBuffer\/PrepareJobs/);
  assert.match(source,/pinned EngMesh::FromGenMesh telemetry anchor drift/);
  assert.match(source,/\[kk-buffer\] meshVerts=%d meshFaces=%d jobs=%d vertexRefs=%d indexRefs=%d/);
  assert.match(source,/log:kk-buffer:200/);
  assert.match(source,/"tessellate":\[1,1,1\]/);
  assert.match(source,/"tessellate":\[4,3,2\]/);
  assert.match(source,/run_browser tessellated/);
  assert.match(source,/run_browser restored/);
  assert.match(source,/topologyChanged/);
  assert.match(source,/restorationExact/);
  assert.match(source,/buffer causality proof failed/);
  assert.match(source,/^cat "\$WORK\/browser-proof\.json"$/m);
});

test("normal proof controls the native GPU stream and requires hash plus framebuffer A/B/A evidence",()=>{
  assert.match(normalPatcher,/pinned EngMesh::FillVertexBuffer normal anchor drift/);
  assert.match(normalPatcher,/FUNCTION_START = "void EngMesh::FillVertexBuffer/);
  assert.match(normalPatcher,/fill_vertex_buffer_section\(source\)/);
  assert.match(normalPatcher,/sGMI_NORMAL/);
  assert.match(normalPatcher,/kkNormalProofMode = 0/);
  assert.match(normalPatcher,/outVert->nx = -outVert->nx/);
  assert.match(normalPatcher,/\[kk-normal\] mode=%d vertices=%d hash=%u/);
  assert.match(source,/run_browser normal-inverted/);
  assert.match(source,/run_browser normal-restored/);
  assert.match(source,/verify-normal-browser-proof\.py/);
  assert.match(normalVerifier,/GenMesh::NeedAllNormals -> EngMesh::FillVertexBuffer -> GPU normal stream -> Browser\/WebGL framebuffer/);
  assert.match(normalVerifier,/Counter\(\(vertices, hash_value\) for _, vertices, hash_value in samples\)/);
  assert.match(normalVerifier,/mode-only transition counted as normal hash change/);
  assert.match(normalVerifier,/--self-test/);
  assert.match(normalVerifier,/sampleCountsAligned/);
  assert.match(normalVerifier,/vertexCountsAligned/);
  assert.match(normalVerifier,/nativeNormalHashRestorationExact/);
  assert.match(normalVerifier,/framebufferEffectExceedsAaNoise5x/);
  assert.doesNotMatch(normalVerifier,/Counter\(baseline\)/);
  assert.doesNotMatch(normalVerifier,/Counter\(inverted\)/);
  assert.match(normalVerifier,/normal causality proof failed/);
});

test("normal proof evidence is exposed and uploaded durably by exact-head CI",()=>{
  assert.match(workflow,/patch-normal-browser-proof\.py/);
  assert.match(workflow,/verify-normal-browser-proof\.py/);
  assert.match(workflow,/Reject mode-only normal hash false positives/);
  assert.match(workflow,/normal-proof\.json/);
  assert.match(workflow,/normal-inverted\.png/);
  assert.match(workflow,/normal-inverted-repeat\.png/);
  assert.match(workflow,/normal-restored\.png/);
  assert.match(workflow,/normal-restored-repeat\.png/);
  assert.match(workflow,/normal-inverted\.log/);
  assert.match(workflow,/normal-restored\.log/);
  assert.match(workflow,/if-no-files-found: error/);
});
