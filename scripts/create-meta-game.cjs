'use strict';
// Local, fixed-destination build. No API, arbitrary source path, or public write.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createGenerationService } = require('../lib/engines/generation-service.cjs');
const fixture = require('../test/fixtures/meta-game-vault.json');
const root = path.resolve(__dirname, '..');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const service = createGenerationService({ sourceCommit });
const created = service.createGame({
  gameCard: fixture.gameCard, randomSeed: fixture.randomSeed,
  recentGames: fixture.recentGames
});
const integrity = service.validateGame(created.artifact_id);
if (!integrity.integrity) throw new Error('Generated package validation failed before output writes');
const artifact = service.previewGame(created.artifact_id).package;
const output = path.join(root, 'generated', 'meta-games', 'witness-vault');
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
  game: fixture.gameCard.id,
  sourceCommit,
  files: Object.keys(artifact.files).length,
  manifest_sha256: artifact.manifest_sha256,
  published: false,
  integrity,
  validation: artifact.manifest.validation
}));
