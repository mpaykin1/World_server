'use strict';
// Local, fixed-destination build. No API, arbitrary source path, or public write.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGenerationService } = require('../lib/engines/generation-service.cjs');
const fixture = require('../test/fixtures/meta-game-vault.json');
const root = path.resolve(__dirname, '..');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const candidate = process.argv.length === 3 && process.argv[2] === '--publication-candidate';
const composed = candidate || (process.argv.length === 3 && process.argv[2] === '--composed');
if (process.argv.length > 2 && !composed) throw new Error('Only --composed or --publication-candidate is accepted');
const service = createGenerationService({ sourceCommit });
let created = service.createGame({
  gameCard: fixture.gameCard, randomSeed: fixture.randomSeed,
  recentGames: fixture.recentGames
});
let composition;
if (composed) {
  const second = service.createGame({
    gameCard: structuredClone(fixture.gameCard), randomSeed: fixture.randomSeed + 1,
    recentGames: fixture.recentGames
  });
  composition = service.combineAssets({ parts: [
    { artifact_id: created.artifact_id, translation: { x:0, y:0, z:0 } },
    { artifact_id: second.artifact_id, translation: { x:30, y:0, z:0 } }
  ]});
  const gameCard = structuredClone(fixture.gameCard);
  if (candidate) gameCard.id = 'generated-confluence-vault';
  gameCard.world = composition.world;
  created = service.createGame({ gameCard, randomSeed: fixture.randomSeed,
    recentGames: fixture.recentGames });
}
const integrity = service.validateGame(created.artifact_id);
if (!integrity.integrity) throw new Error('Generated package validation failed before output writes');
const artifact = service.previewGame(created.artifact_id).package;
const output = path.join(root, 'generated', 'meta-games', candidate ? 'generated-confluence-vault' : composed ? 'composed-vault' : 'witness-vault');
for (const [name, data] of Object.entries(artifact.files)) {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data, { encoding: 'utf8', flag: 'w' });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({
  ...artifact.manifest,
  manifest_sha256: artifact.manifest_sha256
}, null, 2) + '\n');
console.log(JSON.stringify({
  game: artifact.manifest.game_id,
  sourceCommit,
  composition_id: composition?.composition_id,
  composed,
  files: Object.keys(artifact.files).length,
  manifest_sha256: artifact.manifest_sha256,
  published: false,
  integrity,
  validation: artifact.manifest.validation
}));
