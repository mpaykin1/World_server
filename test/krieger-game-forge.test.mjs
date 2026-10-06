import test from "node:test";
import assert from "node:assert/strict";
import {makeRecipe} from "../apps/krieger-game-forge/recipe.mjs";
import {compileKriegerNativeAuthoring,validateNativeAuthoringPlan} from "../tools/krieger-total-control/native-authoring-compiler.mjs";

const presets=["arena","gothic","reactor"];

test("all Game Forge presets compile into anchored KRIEGER plans",()=>{
  for(const preset of presets){
    const recipe=makeRecipe(preset,"FORGE-TEST",{height:1,bevel:1,damage:1,density:1});
    const plan=compileKriegerNativeAuthoring(recipe);
    assert.equal(validateNativeAuthoringPlan(plan).pass,true,preset);
    for(const family of ["geometry","scene","material","weapon","creature","collision","logic","audio"]){
      assert.ok(plan.coverage.realizedFamilies.includes(family),preset+" missing "+family);
    }
    assert.ok(plan.nodes.some(n=>n.runtimeSymbol==="KKriegerGame::FireShot"));
    assert.ok(plan.nodes.some(n=>n.runtimeSymbol==="KKriegerGame::MonsterAI"));
    assert.equal(plan.upstream.commit,"3bf0ff017372e640e966c2785a4d95a998cec242");
  }
});

test("single damage mutation changes the weapon semantic node",()=>{
  const a=compileKriegerNativeAuthoring(makeRecipe("arena","FORGE-TEST",{height:0,bevel:0,damage:0,density:0}));
  const b=compileKriegerNativeAuthoring(makeRecipe("arena","FORGE-TEST",{height:0,bevel:0,damage:1,density:0}));
  const sig=plan=>new Map(plan.nodes.map(n=>[n.semanticId,JSON.stringify({kind:n.kind,handler:n.handler,runtimeSymbol:n.runtimeSymbol,params:n.params})]));
  const sa=sig(a),sb=sig(b),changed=[...sb].filter(([id,value])=>sa.get(id)!==value).map(([id])=>id);
  assert.deepEqual(changed,["pulse","rail"]);
  assert.notEqual(a.recipeHash,b.recipeHash);
});

test("density mutation adds real geometry and collision nodes",()=>{
  const a=compileKriegerNativeAuthoring(makeRecipe("reactor","FORGE-TEST",{height:0,bevel:0,damage:0,density:0}));
  const b=compileKriegerNativeAuthoring(makeRecipe("reactor","FORGE-TEST",{height:0,bevel:0,damage:0,density:2}));
  assert.ok(b.nodes.length>a.nodes.length);
  assert.ok(b.nodes.filter(n=>n.family==="geometry").length>a.nodes.filter(n=>n.family==="geometry").length);
  assert.ok(b.nodes.filter(n=>n.family==="collision").length>a.nodes.filter(n=>n.family==="collision").length);
});
