export const SEMANTIC_SCENE_VERSION = 1;

const CONSUMERS = Object.freeze(["KRIEGER_CLASS", "INK", "CUBE"]);

export function createSemanticScene(seed = 1) {
  const n = Number.isFinite(Number(seed)) ? Number(seed) : 1;
  return Object.freeze({
    version: SEMANTIC_SCENE_VERSION,
    seed: n,
    objects: Object.freeze([
      Object.freeze({ id: "origin", kind: "cube", position: Object.freeze([0, 0, 0]), tags: Object.freeze(["seed", "solid"]) })
    ])
  });
}

export function adaptSemanticScene(scene, consumer) {
  if (!CONSUMERS.includes(consumer)) throw new Error("unsupported consumer: " + consumer);
  if (!scene || scene.version !== SEMANTIC_SCENE_VERSION || !Array.isArray(scene.objects)) {
    throw new Error("invalid semantic scene");
  }
  return Object.freeze({ consumer, seed: scene.seed, objects: scene.objects });
}

export function supportedConsumers() {
  return [...CONSUMERS];
}
