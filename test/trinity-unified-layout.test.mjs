import test from 'node:test';
import assert from 'node:assert/strict';
import {TrinitySceneRecipe} from '../shared/trinity-scene-recipe.mjs';
import {
  canonicalCorridorLayout,
  canonicalLightIntent,
  canonicalLayoutSignature,
  CANONICAL_HERO
} from '../shared/trinity-canonical-layout.mjs';

test('Trinity canonical layout is deterministic and style-independent',()=>{
  const a=canonicalCorridorLayout(TrinitySceneRecipe);
  const b=canonicalCorridorLayout(TrinitySceneRecipe);
  assert.deepEqual(a,b);
  assert.equal(canonicalLayoutSignature(TrinitySceneRecipe),canonicalLayoutSignature(TrinitySceneRecipe));
  assert.ok(a.ribs.length>=8);
  assert.ok(a.columns.length>=16);
  assert.ok(a.floor.length>20);
});

test('foreground and local-light intent live in canonical layout data',()=>{
  assert.ok(CANONICAL_HERO.parts.length>=12);
  assert.deepEqual(CANONICAL_HERO.transform.position,[.24,-.43,-1.06]);
  const lights=canonicalLightIntent(TrinitySceneRecipe);
  assert.ok(lights.filter(x=>x.kind==='local').length>=5);
  assert.ok(lights.some(x=>x.id==='light.lamp'));
});
