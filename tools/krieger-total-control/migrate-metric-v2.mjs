#!/usr/bin/env node
import fs from "node:fs";
import {computeLedger,METRIC_V2,POLICY_V2} from "./evidence-ledger.mjs";

const path="data/krieger-total-control-evidence-ledger.json";
const ledger=JSON.parse(fs.readFileSync(path,"utf8"));

const oldScore=17.391304;
const oldMetric="krieger-total-control/v1-equal-23";
const masterSha="d73b367b1ae216faccbe25cf997b9b99477a4617";

ledger.schemaVersion=2;
ledger.metricVersion=METRIC_V2;
ledger.policyVersion=POLICY_V2;
ledger.metricHistory=[
  {
    metricVersion:oldMetric,
    status:"ARCHIVED",
    chains:["graphics","gameplay"],
    method:"equal_node_control_proven_only",
    totalNodes:23,
    normalizedTotal:100,
    lastCanonicalScore:oldScore,
    lastCanonicalMasterSha:masterSha,
    note:"Preserved historical metric. It omitted Native Authoring and is not used for new K calculations."
  }
];
ledger.policy={
  technicalControl:"CONTROL_PROVEN is an objective technical evidence status. It requires causal runtime evidence, falsification/negative control, restoration where applicable, deterministic regression and exact-SHA provenance. It does not require an owner product verdict.",
  ownerVerdict:"SUCCESS/FAILURE is owner-only and independent from CONTROL_PROVEN. Agents must never write owner SUCCESS/FAILURE.",
  tested:"TESTED means useful technical evidence exists but one or more CONTROL_PROVEN proof edges are still missing.",
  migration:"Metric/policy migration itself contributes zero session delta. Session baseline and current are both recomputed under the same v2 metric."
};
ledger.scoring={
  metricVersion:METRIC_V2,
  method:"fixed_chain_weight_control_proven_only",
  rule:"Only CONTROL_PROVEN contributes to K. Each chain has a fixed weight and nodes share their chain weight equally. UNKNOWN/PARTIAL/TESTED/REGRESSED/BLOCKED contribute zero.",
  chainWeights:{graphics:40,gameplay:25,nativeAuthoring:35},
  totalNodes:40,
  normalizedTotal:100
};
ledger.git.masterBaseline=masterSha;
ledger.git.evidenceBranch="ai/chatgpt/krieger-normal-causality-20261006";
ledger.git.evidenceBase=masterSha;
ledger.git.pr=476;

const masterPromotions=new Set([
  "graphics.generator",
  "graphics.runtime",
  "graphics.vertex_index_buffers",
  "graphics.local_light",
  "graphics.shadow_visibility",
  "graphics.post",
  "graphics.viewport",
  "graphics.canvas",
]);
const candidatePromotions=new Set([...masterPromotions,"graphics.normals","gameplay.damage"]);

for(const chainName of ["graphics","gameplay"]){
  for(const node of ledger.chains[chainName]){
    const original=node.status;
    node.masterStatus=masterPromotions.has(node.id)?"CONTROL_PROVEN":original;
    node.candidateStatus=candidatePromotions.has(node.id)?"CONTROL_PROVEN":node.masterStatus;
    delete node.status;
    node.note=String(node.note||"")
      .replace(/ Owner PASS is still required for CONTROL_PROVEN\.?/g,"")
      .replace(/ no owner-approved arbitrary material authoring claim/g," no arbitrary-material causal runtime proof")
      .replace(/CONTROL_PROVEN requires explicit owner PASS\.?/g,"CONTROL_PROVEN is technical; owner verdict is separate");
  }
}

const native=(id,label,masterStatus,candidateStatus,note)=>({id:`native.${id}`,label,masterStatus,candidateStatus,note});
ledger.chains.nativeAuthoring=[
  native("game_description","GAME DESCRIPTION","PARTIAL","PARTIAL","No general natural-language game-description parser has been causally proven through native KX build/runtime."),
  native("game_recipe","GAME RECIPE","TESTED","TESTED","Deterministic bounded GameRecipe schema is compiled and round-tripped with fail-closed validation."),
  native("krieger_ir","KRIEGER IR","TESTED","TESTED","Source-anchored native authoring plan/IR is deterministic and validated, but whole-chain generalized native runtime control is not yet proven."),
  native("kx_operator_graph","KX/OPERATOR GRAPH","TESTED","TESTED","Real pinned KX operator IDs/classes are emitted and applied; generalized no-manual graph synthesis remains unproven."),
  native("dependency_wiring","DEPENDENCY WIRING","TESTED","TESTED","Compiler emits deterministic graph edges for geometry/material/scene/effect/portal/collision/logic dependencies."),
  native("parameter_binding","PARAMETER BINDING","TESTED","TESTED","Recipe scale was causally observed at authored root 2; broader field-by-field round-trip proof is incomplete."),
  native("geometry","GEOMETRY","TESTED","TESTED","Cube/Bevel/native mesh operators are emitted and reach the Browser/WebGL authored scene."),
  native("bitmap_texture","BITMAP/TEXTURE","PARTIAL","PARTIAL","Texture fields exist in recipe/material structures, but native bitmap/texture authoring and runtime causal proof are incomplete."),
  native("material","MATERIAL","TESTED","TESTED","Native Material + Mesh_MatLink operators are emitted; isolated recipe-material A/B/A framebuffer proof is still missing."),
  native("scene","SCENE","TESTED","TESTED","Native Scene operators and root attachment are exercised in the authored Browser/WASM path."),
  native("animation","ANIMATION","PARTIAL","PARTIAL","No generalized recipe-to-native animation graph compiler has been causally proven."),
  native("effects_audio","EFFECTS/AUDIO","PARTIAL","PARTIAL","PartSystem/PartEmitter/PlaySample operators are source-anchored, but recipe-to-runtime A/B/A proof is missing."),
  native("gameplay_graph","GAMEPLAY GRAPH","PARTIAL","PARTIAL","Weapon/AI runtime bindings are represented, but generalized serialized native gameplay graph synthesis is incomplete."),
  native("serialization","SERIALIZATION","TESTED","TESTED","Authored KX is losslessly reparsed in exact-head tests; generalized multi-game round-trip remains incomplete."),
  native("build_wasm","BUILD/WASM","TESTED","TESTED","Pinned native KX/WASM build is automated and bounded under Run Supervisor."),
  native("run","RUN","TESTED","TESTED","Authored native result runs in real Chromium/WebGL; generalization across three unseen games is not yet proven."),
  native("validation","VALIDATION","TESTED","TESTED","Fail-closed validators, exact-SHA workflows, A/A controls and artifact checks exist for the current vertical slice.")
];

ledger.technicalEvidence=ledger.technicalEvidence||[];
for(const e of ledger.technicalEvidence){
  if(e.id==="native-normal-stream-browser-causality-2026-10-06"){
    e.status="CONTROL_PROVEN";
    e.exactSha="8f3f24d070af63d27538a1c38b699c8f3c5d7ab1";
    e.workflowRun="https://github.com/mpaykin1/World_server/actions/runs/37416924362";
    e.artifact="https://github.com/mpaykin1/World_server/actions/runs/37416924362/artifacts/11391578173";
    e.artifactDigest="sha256:242462020b6d877646d904168af58728b6a94af210c3d3659e20db5e844426c5";
    e.measurements={
      baselineSamples:180,invertedSamples:180,restoredSamples:180,
      sampleCountsAligned:true,vertexCountsAligned:true,
      nativeNormalHashChanged:true,nativeNormalHashRestorationExact:true,
      invertedAaMeanAbsoluteChannelDelta:0.010848,
      restoredAaMeanAbsoluteChannelDelta:0.039902,
      invertedVsRestoredMeanAbsoluteChannelDelta:5.870503,
      framebufferEffectExceedsAaNoise5x:true
    };
    e.rule="Technical causal proof is sufficient for CONTROL_PROVEN under policy v2; owner verdict remains UNSET.";
  }
  if(e.id==="vertex-index-buffer-browser-causality-2026-10-06"){
    e.status="CONTROL_PROVEN";
    e.rule="Merged Browser/WebGL topology A/B/A proof is CONTROL_PROVEN under policy v2; owner verdict remains separate.";
  }
  if(e.id==="native-light-shadow-vno-2026-10-05"){
    e.status="CONTROL_PROVEN";
    e.rule="Exact-SHA native framebuffer ablation + zero-noise restoration is CONTROL_PROVEN for local light and shadow/visibility under policy v2.";
  }
  if(e.id==="native-authoring-browser-causality-2026-10-05"){
    e.status="TESTED";
    e.controlProvenNodes=["graphics.generator"];
    e.testedNodes=["graphics.data"];
    e.rule="Existing causal authoring evidence closes graphics.generator under policy v2; graphics.data remains TESTED pending a narrower data-control falsification.";
  }
}

ledger.technicalEvidence.unshift({
  id:"gameplay-damage-browser-causality-2026-10-06",
  status:"CONTROL_PROVEN",
  exactSha:"b08da990f221ab0450dfca960b25c74bd7f5f42a",
  workflowRun:"https://github.com/mpaykin1/World_server/actions/runs/37447495619",
  artifact:"https://github.com/mpaykin1/World_server/actions/runs/37447495619/artifacts/11403593109",
  artifactDigest:"sha256:c31889ca7a0afe099a45e146edba581310031d3c81f339ebf02185076d3d93d3",
  nodes:["gameplay.damage"],
  boundary:"Browser key k -> SDL native KeyBuffer -> KKriegerGame::OnKey -> KKriegerPlayer::Hit(10) -> Player.Life",
  measurements:{
    baselineLife:16100,negativeControlLife:16100,damagedLife:16090,restoredLife:16100,
    irrelevantKeyNoEffect:true,damageObserved:true,damageAmount:10,restorationExact:true,
    negativeKeyReachedNativeQueue:true,damageKeyReachedNativeQueue:true
  },
  falsification:"Irrelevant q must reach the native queue without damage; k must reach the native queue and reduce Life; fresh A2 must restore exactly.",
  rule:"Technical causal proof is CONTROL_PROVEN under policy v2; owner verdict remains UNSET."
});

ledger.pendingSlice={
  node:"native.material",
  targetStatus:"CONTROL_PROVEN",
  implementation:"Change exactly one GameRecipe material field, prove targeted IR/KX mutation, native build, Browser/WebGL effect, negative control and A/B/A2 restoration.",
  blocker:"None known; this is the next bounded high-leverage authoring proof after metric migration.",
  rule:"Do not claim CONTROL_PROVEN until recipe->IR->KX->build->runtime causality, VNO and restoration all pass."
};

ledger.currentCandidate={
  branch:"ai/chatgpt/krieger-normal-causality-20261006",
  ownerVerdict:"UNSET",
  state:"METRIC_V2_MIGRATION_WITH_NORMALS_AND_DAMAGE_TECHNICAL_CONTROL_PROVEN",
  candidateSources:[
    {pr:476,head:"8f3f24d070af63d27538a1c38b699c8f3c5d7ab1",node:"graphics.normals"},
    {pr:477,head:"b08da990f221ab0450dfca960b25c74bd7f5f42a",node:"gameplay.damage"}
  ],
  browserProof:"PR476 run 37416924362 PASS; PR477 damage run 37447495619 PASS",
  processTreeProof:"PR476 all nine exact-head workflows PASS; PR477 exact-head damage/CI/Fleet/quality/science/deploy workflows PASS",
  rule:"Technical CONTROL_PROVEN is independent of owner SUCCESS/FAILURE. Owner verdict remains UNSET."
};

let computed=computeLedger(ledger);
if(computed.errors.length)throw new Error(computed.errors.join("; "));
ledger.migration={
  fromMetricVersion:oldMetric,
  toMetricVersion:METRIC_V2,
  fromPolicy:"owner-verdict-gated-control-proven",
  toPolicy:POLICY_V2,
  reason:"Canonical metric omitted Native Authoring and conflated objective technical CONTROL_PROVEN with owner-only SUCCESS/FAILURE.",
  scoreNeutrality:"Baseline and current are computed with v2; migration itself contributes zero session delta.",
  sessionBaselineAt:"2026-10-06T10:16:00Z",
  sessionBaselineMaster:computed.masterWeight,
  sessionBaselineCandidate:computed.candidateWeight
};
ledger.computed={
  totalNodes:computed.nodes.length,
  masterProvenNodes:computed.masterProven.length,
  masterProvenNodeIds:computed.masterProven.map(n=>n.id),
  masterWeight:computed.masterWeight,
  candidateProvenNodes:computed.candidateProven.length,
  candidateProvenNodeIds:computed.candidateProven.map(n=>n.id),
  candidateWeight:computed.candidateWeight
};
ledger.updatedDate="2026-10-06";

fs.writeFileSync(path,JSON.stringify(ledger,null,2)+"\n");
console.log(JSON.stringify({pass:true,metricVersion:ledger.metricVersion,master:computed.masterWeight,candidate:computed.candidateWeight,totalNodes:computed.nodes.length},null,2));
