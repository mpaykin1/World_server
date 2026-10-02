import {createSemanticScene, adaptSemanticScene} from "./semantic-scene-contract-v1.mjs";

export const CANONICAL_SCENE_SEED = 42;

export function createConsumerSemanticScene(consumer, seed = CANONICAL_SCENE_SEED) {
  return adaptSemanticScene(createSemanticScene(seed), consumer);
}

export function installSemanticSceneConsumer(consumer, target = globalThis, seed = CANONICAL_SCENE_SEED) {
  const scene = createConsumerSemanticScene(consumer, seed);
  target.WorldSemanticScene = Object.freeze({consumer, scene});
  return scene;
}
