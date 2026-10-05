import test from "node:test";
import assert from "node:assert/strict";
import {compileKriegerNativeAuthoring} from "../tools/krieger-total-control/native-authoring-compiler.mjs";
import {packAuthoringNode} from "../tools/krieger-total-control/semantic-kx-authoring.mjs";

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
    kxConvention:0x0000010a,
    kxPacking:"ggggggfffb",
  });
  const baselineBytes=packAuthoringNode(bind(baseline.nodes.find(n=>n.semanticId==="box:scene")));
  const mutatedBytes=packAuthoringNode(bind(mutated.nodes.find(n=>n.semanticId==="box:scene")));

  assert.notDeepEqual(baselineBytes,mutatedBytes);
  assert.equal(baselineBytes.length,mutatedBytes.length);
});
