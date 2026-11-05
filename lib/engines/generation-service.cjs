'use strict';
const { createGameArtifact } = require('./game-builder.cjs');
const { validateGameArtifact } = require('./game-validation.cjs');
const { combineGeneratedWorlds } = require('./world-composition.cjs');
const { createPublicationOperation } = require('./publication-operation.cjs');
// Trusted local orchestration only. Publication requires an explicit host backend.
function createGenerationService({ sourceCommit, publicationBackend } = {}) {
  if (typeof sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(sourceCommit))
    throw new TypeError('Exact trusted sourceCommit required');
  const packages = new Map();
  const read = id => {
    if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !packages.has(id))
      throw new Error('Artifact unavailable');
    return packages.get(id);
  };
  function createGame(input) {
    if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
        Object.keys(input).some(k => !['gameCard','randomSeed','recentGames'].includes(k)))
      throw new TypeError('Only structured game parameters accepted');
    // This API accepts JSON data from trusted local callers, never scripts or paths.
    const encoded = JSON.stringify(input);
    if (Buffer.byteLength(encoded, 'utf8') > 65536)
      throw new RangeError('Game request exceeds 64 KiB');
    const request = JSON.parse(encoded);
    if (request.recentGames !== undefined &&
        (!Array.isArray(request.recentGames) || request.recentGames.length > 8))
      throw new RangeError('At most eight recent games');
    const artifact = createGameArtifact({ ...request, sourceCommit });
    const result = validateGameArtifact(artifact, { sourceCommit });
    if (!result.integrity) throw new Error('Generated package validation failed');
    const id = artifact.manifest_sha256;
    if (!packages.has(id)) {
      if (packages.size === 4) packages.delete(packages.keys().next().value);
      packages.set(id, artifact);
    }
    return { artifact_id: id, ...result };
  }
  function validateGame(id) {
    return validateGameArtifact(read(id), { sourceCommit });
  }
  function previewGame(id) {
    const artifact = read(id);
    const validation = validateGameArtifact(artifact, { sourceCommit });
    if (!validation.integrity) throw new Error('Package integrity failure');
    // Return data, not an executable URL or a claimed browser/publication result.
    return { artifact_id: id, entry: 'index.html', validation,
      package: structuredClone(artifact) };
  }
  const combineAssets = input => combineGeneratedWorlds(input, read, sourceCommit);
  // Configuration belongs to the trusted host, never createGame/RPC arguments.
  const publishGame = publicationBackend === undefined ? undefined :
    createPublicationOperation({ sourceCommit, readArtifact: read, backend: publicationBackend });
  return Object.freeze({ createGame, validateGame, previewGame, combineAssets,
    ...(publishGame ? { publishGame } : {}) });
}
module.exports = { createGenerationService };
