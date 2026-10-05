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
    {id:"pillar",primitive:"bevel",material:"steel",position:[2,2,0],params:{amount:.1}},
  ],
  effects:[{id:"dust",kind:"particles",attachTo:"pillar",rate:20}],
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
  assert.equal(plan.coverage.requiredRatio,1);
  assert.equal(plan.coverage.sourceAnchoredRatio,1);
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="GenSimpleMesh::Cube"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="GenMaterial::AddPass"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="ExecSceneInput"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="KKriegerGame::FireShot"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="KKriegerMonster"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="KKriegerGame::MonsterAI"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="KKriegerCell"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="KLogic"));
  assert.ok(plan.nodes.some(n=>n.sourceSymbol==="RenderSoundEffects"));
  assert.equal(validateNativeAuthoringPlan(plan).pass,true);
});

test("same recipe is deterministic down to node ids and graph edges",()=>{
  assert.deepEqual(compileKriegerNativeAuthoring(room()),compileKriegerNativeAuthoring(room()));
});

test("semantic recipe round-trips without losing author intent",()=>{
  const recipe=room();
  assert.deepEqual(roundTripRecipe(compileKriegerNativeAuthoring(recipe)),roundTripRecipe(compileKriegerNativeAuthoring(recipe)));
});

test("unsupported geometry fails closed instead of silently downgrading",()=>{
  const recipe=room();
  recipe.objects[0].primitive="metaball";
  assert.throws(()=>compileKriegerNativeAuthoring(recipe),/unsupported Krieger geometry primitive/);
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
  assert.ok(merged.nodes.some(n=>n.sourceSymbol==="GenSimpleMesh::Cube"));
  assert.equal(merged.kriegerAuthoring.recipeHash,plan.recipeHash);
});

test("tampered plans are rejected before mutation",()=>{
  const plan=compileKriegerNativeAuthoring(room());
  plan.edges.push({from:"missing",to:plan.nodes[0].id,port:"input"});
  const verdict=validateNativeAuthoringPlan(plan);
  assert.equal(verdict.pass,false);
  assert.ok(verdict.errors.some(x=>x.includes("dangling edge")));
});
