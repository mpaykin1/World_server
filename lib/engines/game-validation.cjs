'use strict';
const { packArtifact, verifyArtifact } = require('./artifact.cjs');
// Pure package boundary. Never execute, fetch, publish or trust self-reported PASS.
function validateGameArtifact(artifact, { sourceCommit } = {}) {
  const denied = () => ({ integrity: false, browser: 'not_run',
    rights: 'not_verified', publication: 'not_published' });
  try {
    if (!verifyArtifact(artifact)) return denied();
    const m = artifact.manifest;
    if (sourceCommit !== undefined && m.source_commit !== sourceCommit) return denied();
    const pipeline = JSON.parse(artifact.files['data/pipeline.json']);
    const provenance = JSON.parse(artifact.files['data/provenance.json']);
    if (provenance.sourceCommit !== m.source_commit ||
        !Array.isArray(provenance.externalAssets) || provenance.externalAssets.length)
      return denied();
    // Rebuild the expected manifest from the actual trace rather than accepting
    // a rehashed caller-supplied manifest with invented stages or validation.
    const rebuilt = packArtifact({ gameId: m.game_id, sourceCommit: m.source_commit,
      pipelineResult: pipeline, files: artifact.files });
    if (rebuilt.manifest_sha256 !== artifact.manifest_sha256) return denied();
    return { integrity: true, game_id: m.game_id, source_commit: m.source_commit,
      manifest_sha256: artifact.manifest_sha256, browser: 'not_run',
      rights: 'not_verified', publication: 'not_published' };
  } catch { return denied(); }
}
module.exports = { validateGameArtifact };
