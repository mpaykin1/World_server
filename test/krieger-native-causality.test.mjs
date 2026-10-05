import test from "node:test";
import assert from "node:assert/strict";
import {compileKriegerNativeAuthoring} from "../tools/krieger-total-control/native-authoring-compiler.mjs";
import {packAuthoringNode,emitSemanticKx} from "../tools/krieger-total-control/semantic-kx-authoring.mjs";
import {parseKxGraph,verifyKxByteRoundTrip} from "../tools/krieger-total-control/kx-graph-codec.mjs";
import {loadPinnedResolverEvidence,prepareRecipeForTarget} from "../tools/krieger-total-control/native-authoring-kx-pipeline.mjs";
import fs from "node:fs";
import path from "node:path";

const recipe={
  id:"causal-scale-proof",
  objects:[{
    id:"box",
    primitive:"cube",
    position:[0,0,-2],
    scale:[4,4,4],
    modifiers:[{id:"edge",kind:"bevel",params:{amount:0.08}}],
  }],
};

function semanticNodes(plan){
  return new Map(plan.nodes.map(n=>[n.semanticId,{
    semanticId:n.semanticId,kind:n.kind,family:n.family,
    handler:n.handler,operatorId:n.operatorId,params:n.params,
  }]));
}

function semanticEdges(plan){
  const byId=new Map(plan.nodes.map(n=>[n.id,n.semanticId]));
  return plan.edges.map(e=>({
    from:byId.get(e.from),to:byId.get(e.to),port:e.port,
  }));
}

test("single GameRecipe field causally targets one Scene IR node and native packed bytes",()=>{
  const changed=structuredClone(recipe);
  changed.objects[0].scale[0]=5;

  const baseline=compileKriegerNativeAuthoring(recipe);
  const mutated=compileKriegerNativeAuthoring(changed);

  assert.notEqual(baseline.recipeHash,mutated.recipeHash);
  assert.deepEqual(semanticEdges(baseline),semanticEdges(mutated));

  const a=semanticNodes(baseline);
  const b=semanticNodes(mutated);
  assert.deepEqual([...a.keys()],[...b.keys()]);

  const changedNodes=[];
  for(const [semanticId,left] of a){
    const right=b.get(semanticId);
    if(JSON.stringify(left)!==JSON.stringify(right)) changedNodes.push(semanticId);
  }
  assert.deepEqual(changedNodes,["box:scene"]);
  assert.deepEqual(a.get("box:scene").params.scale,[4,4,4]);
  assert.deepEqual(b.get("box:scene").params.scale,[5,4,4]);

  const bind=(node)=>({
    ...node,
    kxBinding:"document-operator",
    kxConvention:0x8000010a,
    kxPacking:"ggggggfffb",
  });
  const baselineBytes=packAuthoringNode(bind(baseline.nodes.find(n=>n.semanticId==="box:scene")));
  const mutatedBytes=packAuthoringNode(bind(mutated.nodes.find(n=>n.semanticId==="box:scene")));

  assert.notDeepEqual(baselineBytes,mutatedBytes);
  assert.equal(baselineBytes.length,mutatedBytes.length);
});

test("single GameRecipe scale field causally changes exact emitted native KX bytes",async(t)=>{
  const changed=structuredClone(recipe);
  changed.objects[0].scale[0]=5;
  const upstream=process.env.KRIEGER_PINNED_UPSTREAM_ROOT;
  if(!upstream){t.skip("requires the exact pinned upstream fixture; proof workflow provides it");return;}
  const targetPath=path.join(upstream,"data","kkrieger3383.kx");
  assert.ok(fs.existsSync(targetPath),`pinned upstream fixture is missing: ${targetPath}`);
  const evidence=loadPinnedResolverEvidence(upstream);
  const prepare=(source)=>prepareRecipeForTarget({
    recipe:source,
    targetBytes:fs.readFileSync(targetPath),
    ...evidence,
  });
  const baselinePrepared=prepare(recipe),mutatedPrepared=prepare(changed);
  assert.equal(baselinePrepared.plan.targetKx.addedClasses.length,1);
  assert.equal(baselinePrepared.plan.targetKx.addedClasses[0].operatorId,0x90);
  const baseline=emitSemanticKx({preparedBytes:baselinePrepared.bytes,preparedPlan:baselinePrepared.plan});
  const mutated=emitSemanticKx({preparedBytes:mutatedPrepared.bytes,preparedPlan:mutatedPrepared.plan});
  const baseGraph=parseKxGraph(baseline.bytes);
  const changedGraph=parseKxGraph(mutated.bytes);
  assert.notDeepEqual(baseline.bytes,mutated.bytes);
  assert.equal(baseline.plan.emittedKx.losslessReparse,true);
  assert.equal(mutated.plan.emittedKx.losslessReparse,true);
  assert.equal(verifyKxByteRoundTrip(baseline.bytes).pass,true);
  assert.equal(verifyKxByteRoundTrip(mutated.bytes).pass,true);

  const baseOps=baseGraph.ops.slice(-baseline.specs.length);
  const mutatedOps=changedGraph.ops.slice(-mutated.specs.length);
  const changedIndexes=baseOps.flatMap((op,i)=>
    JSON.stringify(op)!==JSON.stringify(mutatedOps[i])?[i]:[]);
  assert.deepEqual(changedIndexes,[baseline.specs.findIndex(spec=>spec.operatorId===0xc0)]);
  assert.deepEqual(baseOps.filter(op=>op.realId!==0xc0).map(op=>op.paramsRaw),
    mutatedOps.filter(op=>op.realId!==0xc0).map(op=>op.paramsRaw));
  assert.deepEqual(baseGraph.ops.map(op=>op.realId),changedGraph.ops.map(op=>op.realId));
  assert.deepEqual(baseGraph.ops.map(op=>op.inputs),changedGraph.ops.map(op=>op.inputs));
  assert.deepEqual(baseGraph.header.roots,changedGraph.header.roots);
});
