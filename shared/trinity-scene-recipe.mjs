const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};

export const TRINITY_SCENE_VERSION = 1;
export const TRINITY_SEED = 731942;

export const TrinitySceneRecipe = freeze({
  version: TRINITY_SCENE_VERSION,
  id: 'trinity-courtyard-v1',
  seed: TRINITY_SEED,
  terrain: { size: [18, 0.5, 15], position: [0, -0.3, 1], material: 'stone-earth' },
  architecture: [
    { id: 'tower.main', kind: 'tower', position: [-3.0, 0, 15.2], size: [3.4, 5.8, 3.4], material: 'aged-stone' },
    { id: 'bridge.arch', kind: 'bridge', position: [0, 0.05, 4.2], size: [4.8, 1.15, 2.0], material: 'warm-stone' }
  ],
  vegetation: [
    { id: 'tree.courtyard', kind: 'tree', position: [2.55, 0, 13.4], scale: 1.08, material: 'living-green' }
  ],
  characters: [
    { id: 'character.walker', kind: 'character', position: [-0.7, 0, 6.3], heading: 0.45, material: 'desaturated-human' }
  ],
  lights: [
    { id: 'light.lamp', kind: 'lamp', position: [-0.9, 0, 6.9], intensity: 2.1, color: '#ffc77b' }
  ],
  water: [
    { id: 'water.rill', kind: 'water', position: [1.1, -0.03, 7.2], size: [0.65, 0.04, 6.0], material: 'water' }
  ],
  props: [
    { id: 'rock.west', kind: 'rock', position: [-1.15, 0.05, 4.1], scale: 0.72, material: 'rock' },
    { id: 'rock.east', kind: 'rock', position: [2.25, 0.05, 12.0], scale: 0.92, material: 'rock' }
  ],
  artDirection: {
    KRIEGER: { corridorSegments: 15, spacing: 2.8, halfWidth: 3.45, height: 5.0, startZ: -5.8 },
    INK: { architecturalRhythm: true, depthPlanes: 6 }
  },
  events: [{ id: 'event.walk-loop', kind: 'walk-loop', target: 'character.walker' }],
  evolution: {
    durationMs: 12000,
    stages: [
      ['cube', 0, 0.16], ['matter', 0.10, 0.34], ['terrain', 0.24, 0.50],
      ['biome', 0.42, 0.66], ['architecture', 0.56, 0.82],
      ['materials', 0.72, 0.92], ['lighting', 0.82, 0.98], ['life', 0.88, 1]
    ]
  }
});

export function semanticObjects(recipe = TrinitySceneRecipe) {
  return [
    { id: 'terrain.courtyard', kind: 'terrain', ...recipe.terrain },
    ...recipe.architecture,
    ...recipe.vegetation,
    ...recipe.characters,
    ...recipe.lights,
    ...recipe.water,
    ...recipe.props
  ];
}

export function semanticIds(recipe = TrinitySceneRecipe) {
  return semanticObjects(recipe).map(object => object.id).sort();
}

export function semanticSignature(recipe = TrinitySceneRecipe) {
  let hash = 2166136261;
  const feed = text => {
    for (const ch of String(text)) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
  };
  feed(recipe.version);
  feed(recipe.seed);
  for (const object of semanticObjects(recipe)) {
    feed(object.id); feed(object.kind); feed(JSON.stringify(object.position || []));
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function adaptTrinityScene(recipe, consumer) {
  if (!['KRIEGER', 'INK', 'CUBE'].includes(consumer)) throw new Error('unsupported consumer: ' + consumer);
  return freeze({ consumer, seed: recipe.seed, signature: semanticSignature(recipe), objects: semanticObjects(recipe) });
}

