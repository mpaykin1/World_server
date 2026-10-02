'use strict';

const { huntArchitectureSeeds, createArchitectureDNA, sampleBuildingRecipe } = require('../lib/architecture-seeds');

function args(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const next = argv[i + 1];
    out[name] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const input = args(process.argv);
const idea = String(input.idea || '');
const theme = String(input.theme || 'mixed');
const startSeed = String(input.seed || input.start || '1');
const count = Number(input.count || 256);
const limit = Number(input.limit || 12);
const modifiers = String(input.modifier || '').split(',').map(x => x.trim()).filter(Boolean);
const criteria = { family: input.family ? String(input.family) : undefined, modifiers };

if (input.preview) {
  const architecture = createArchitectureDNA({ seed: startSeed, idea, theme });
  const sample = sampleBuildingRecipe(architecture, {
    x: Number(input.x || 0), z: Number(input.z || 0),
    lotWidth: Number(input.width || 12), lotDepth: Number(input.depth || 16)
  });
  process.stdout.write(JSON.stringify({ architecture, sample }, null, 2) + '\n');
} else {
  const seeds = huntArchitectureSeeds({ startSeed, count, idea, theme, criteria, limit });
  process.stdout.write(JSON.stringify({ query: { startSeed, count, idea, theme, criteria, limit }, seeds }, null, 2) + '\n');
}
