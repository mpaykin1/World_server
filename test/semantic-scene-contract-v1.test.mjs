import test from "node:test";
import assert from "node:assert/strict";
import { createSemanticScene, adaptSemanticScene, supportedConsumers } from "../shared/semantic-scene-contract-v1.mjs";

test("semantic scene is deterministic and adapts to all canonical consumers", () => {
  const a = createSemanticScene(42);
  const b = createSemanticScene(42);
  assert.deepEqual(a, b);
  assert.deepEqual(supportedConsumers(), ["KRIEGER_CLASS", "INK", "CUBE"]);
  for (const consumer of supportedConsumers()) {
    const adapted = adaptSemanticScene(a, consumer);
    assert.equal(adapted.consumer, consumer);
    assert.equal(adapted.seed, 42);
    assert.deepEqual(adapted.objects, a.objects);
  }
});
