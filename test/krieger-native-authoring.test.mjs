import test from "node:test";
import assert from "node:assert/strict";
import {
  compileKriegerNativeAuthoring,
  validateNativeAuthoringPlan,
  roundTripRecipe,
  applyAuthoringPlan,
} from "../tools/krieger-total-control/native-authoring-compiler.mjs";

const room=()=>({
  id:"room-alpha",seed:42,
  materials:[{id:"steel",usage:4,program:1,pass:0}],
  objects:[
    {id:"floor",primitive:"cube",material:"steel",scale:[8,.5,8]},
    {id:"pillar",primitive:"cube",material:"steel",position:[2,2,0],modifiers:[{kind:"bevel",params:{amount:.1}}]},
  ],
  effects:[{id:"dust",kind:"partSystem",attachTo:"pillar",rate:20}],
  weapons:[{id:"rifle",slot:2,damage:12,cadence:6,effect:"dust"}],
  portals:[{id:"door",from:"floor",to:"pillar"}],
  creatures:[{id:"guard",attachTo:"floor",behavior:"patrol",weapon:"rifle"}],
  colliders:[{id:"pillar-collider",attachTo:"pillar",shape:"mesh"}],
  triggers:[{id:"alarm",target:"guard",event:"enter",action:"enable"}],
  audio:[{id:"shot-sound",kind:"v2",cue:"rifle"}],
});

test("compiler emits source-anchored Krieger operator plan",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  assert.equal(plan.schema,"world-server.krieger-native-authoring/v1");
  assert.equal(plan.upstream.commit,"3bf0ff017372e640e966c2785a4d95a998cec242");
  assert.equal(plan.coverage.requestedRatio,1);
  assert.equal(plan.coverage.evidenceAnchoredRatio,1);
  assert.ok(plan.coverage.nativeOperatorRatio>0);
  assert.ok(plan.coverage.runtimeBindingRatio>0);
  assert.ok(plan.nodes.some(n=>n.handler==="Mesh_Cube"&&n.operatorId===0x81));
  assert.ok(plan.nodes.some(n=>n.handler==="Mesh_Bevel"&&n.operatorId===0x90));
  assert.ok(plan.nodes.some(n=>n.handler==="Init_Material_Material"&&n.operatorId===0xd0));
  assert.ok(plan.nodes.some(n=>n.handler==="Mesh_MatLink"&&n.operatorId===0x96));
  assert.ok(plan.nodes.some(n=>n.handler==="Init_Scene_Scene"&&n.operatorId===0xc0));
  assert.ok(plan.nodes.some(n=>n.runtimeSymbol==="KKriegerGame::FireShot"));
  assert.ok(plan.nodes.some(n=>n.handler==="Init_KKrieger_Monster"&&n.operatorId===0x11));
  assert.ok(plan.nodes.some(n=>n.runtimeSymbol==="KKriegerGame::MonsterAI"));
  assert.ok(plan.nodes.some(n=>n.handler==="Mesh_CollisionCube"&&n.operatorId===0x9c));
  assert.ok(plan.nodes.some(n=>n.handler==="Init_Misc_Trigger"&&n.operatorId===0x07));
  assert.ok(plan.nodes.some(n=>n.handler==="Exec_Misc_PlaySample"&&n.operatorId===0x0c));
  assert.equal(validateNativeAuthoringPlan(plan).pass,true);
});

test("same recipe is deterministic down to node ids and graph edges",()=>{
  assert.deepEqual(compileKriegerNativeAuthoring(room()),compileKriegerNativeAuthoring(room()));
});

test("semantic recipe round-trips without losing compiled meaning",()=>{
  const first=compileKriegerNativeAuthoring(room());
  const recipe2=roundTripRecipe(first);
  const second=compileKriegerNativeAuthoring(recipe2);
  assert.equal(second.recipeHash,first.recipeHash);
  assert.deepEqual(second.nodes,first.nodes);
  assert.deepEqual(second.edges,first.edges);
});

test("unsupported geometry fails closed instead of silently downgrading",()=>{
  const recipe=room();
  recipe.objects[0].primitive="metaball";
  assert.throws(()=>compileKriegerNativeAuthoring(recipe),/unsupported Krieger base primitive/);
});

test("unknown material and attachment references fail closed",()=>{
  const a=room();a.objects[0].material="missing";
  assert.throws(()=>compileKriegerNativeAuthoring(a),/unknown material/);
  const b=room();b.effects[0].attachTo="missing";
  assert.throws(()=>compileKriegerNativeAuthoring(b),/unknown effect attachment/);
});

test("plan can be applied to an existing graph without deleting old nodes",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  const base={nodes:[{id:"existing",kind:"root"}],edges:[]};
  const merged=applyAuthoringPlan(base,plan);
  assert.ok(merged.nodes.some(n=>n.id==="existing"));
  assert.ok(merged.nodes.some(n=>n.handler==="Mesh_Cube"&&n.operatorId===0x81));
  assert.equal(merged.kriegerAuthoring.recipeHash,plan.recipeHash);
});

test("tampered plans are rejected before mutation",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  plan.edges.push({from:"missing",to:plan.nodes[0].id,port:"input"});
  const verdict=validateNativeAuthoringPlan(plan);
  assert.equal(verdict.pass,false);
  assert.ok(verdict.errors.some(x=>x.includes("dangling edge")));
});


test("modifiers compile as an ordered mesh-input chain, never as root primitives",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  const base=plan.nodes.find(n=>n.semanticId==="pillar"&&n.kind==="geometry-base");
  const bevel=plan.nodes.find(n=>n.kind==="geometry-modifier"&&n.params.kind==="bevel");
  assert.ok(base&&bevel);
  assert.ok(plan.edges.some(e=>e.from===base.id&&e.to===bevel.id&&e.port==="mesh-input"));
});

test("internal geometry helpers that are not exported operators fail closed",()=>{
  const recipe=room();
  recipe.objects[0].primitive="ring";
  assert.throws(()=>compileKriegerNativeAuthoring(recipe),/unsupported Krieger base primitive/);
});


test("material assignment is a real Mesh_MatLink operator in the mesh chain",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  const object=plan.recipe.objects.find(x=>x.id==="floor");
  assert.equal(object.material,"steel");
  const mat=plan.nodes.find(n=>n.semanticId==="steel"&&n.kind==="material");
  const link=plan.nodes.find(n=>n.semanticId==="floor:material"&&n.handler==="Mesh_MatLink");
  const transform=plan.nodes.find(n=>n.semanticId==="floor:transform");
  assert.ok(mat&&link&&transform);
  assert.ok(plan.edges.some(e=>e.from===mat.id&&e.to===link.id&&e.port==="material-link"));
  assert.ok(plan.edges.some(e=>e.from===link.id&&e.to===transform.id&&e.port==="input"));
});

test("effects and portals reject ambiguous semantics",()=>{
  const a=room();a.effects[0].kind="particles";
  assert.throws(()=>compileKriegerNativeAuthoring(a),/unsupported Krieger effect kind/);
  const b=room();delete b.portals[0].to;
  assert.throws(()=>compileKriegerNativeAuthoring(b),/requires both from and to endpoints/);
  const c=room();c.portals[0].to=c.portals[0].from;
  assert.throws(()=>compileKriegerNativeAuthoring(c),/endpoints must differ/);
});


test("coverage distinguishes native document operators from runtime bindings",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  assert.ok(plan.coverage.nativeOperatorRatio<1);
  assert.ok(plan.coverage.runtimeBindingRatio>0);
  assert.equal(plan.coverage.evidenceAnchoredRatio,1);
  assert.ok(plan.coverage.requestedFamilies.includes("weapon"));
  assert.ok(plan.coverage.requestedFamilies.includes("creature"));
});
