import test from 'node:test';
import assert from 'node:assert/strict';
import {TrinitySceneRecipe,semanticIds,semanticSignature,adaptTrinityScene} from '../shared/trinity-scene-recipe.mjs';
import {cubeDeterministicSignature} from '../apps/trinity-lab/cube-evolution.mjs';

test('Trinity uses one immutable semantic recipe for all three consumers',()=>{
  const k=adaptTrinityScene(TrinitySceneRecipe,'KRIEGER');
  const i=adaptTrinityScene(TrinitySceneRecipe,'INK');
  const c=adaptTrinityScene(TrinitySceneRecipe,'CUBE');
  assert.equal(k.seed,i.seed);assert.equal(i.seed,c.seed);
  assert.equal(k.signature,i.signature);assert.equal(i.signature,c.signature);
  assert.equal(k.signature,semanticSignature(TrinitySceneRecipe));
  assert.ok(Object.isFrozen(TrinitySceneRecipe));
});
test('recipe contains the requested semantic scene',()=>{
  const ids=semanticIds(TrinitySceneRecipe);
  for(const id of ['terrain.courtyard','tower.main','bridge.arch','tree.courtyard','character.walker','light.lamp','water.rill','rock.west','rock.east'])assert.ok(ids.includes(id),id);
});
test('cube generation signature is deterministic for the fixed seed',()=>{
  assert.equal(cubeDeterministicSignature(TrinitySceneRecipe),cubeDeterministicSignature(TrinitySceneRecipe));
  assert.equal(TrinitySceneRecipe.evolution.durationMs,12000);
});
