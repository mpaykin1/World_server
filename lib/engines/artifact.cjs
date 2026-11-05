'use strict';
const { createHash } = require('node:crypto');
const ORDER = ['calc', 'dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding'];
const hash = text => createHash('sha256').update(text).digest('hex');
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new TypeError('Artifact evidence must contain only finite JSON data');
}
function fileEntries(files) {
  if (!files || Object.getPrototypeOf(files) !== Object.prototype) throw new TypeError('files must be an object');
  const paths = Object.keys(files).sort(), seen = new Set();
  if (!paths.length || paths.length > 100) throw new RangeError('files count must be 1..100');
  let total = 0;
  return paths.map(path => {
    if (path.length > 180 || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:html|js|mjs|css|json|glsl)$/.test(path))
      throw new TypeError('Unsafe artifact path');
    if (path.split('/').some(part => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part)))
      throw new TypeError('Unsafe artifact path');
    if (seen.has(path.toLowerCase())) throw new TypeError('Case-colliding artifact paths');
    seen.add(path.toLowerCase());
    const text = files[path];
    if (typeof text !== 'string') throw new TypeError('Artifact files must be UTF-8 text');
    const bytes = Buffer.byteLength(text, 'utf8'); total += bytes;
    if (!bytes || bytes > 1048576 || total > 4194304) throw new RangeError('Artifact size budget exceeded');
    return { path, bytes, sha256: hash(text) };
  });
}
function packArtifact({ gameId, sourceCommit, pipelineResult, files } = {}) {
  if (typeof gameId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(gameId)) throw new TypeError('Invalid gameId');
  if (typeof sourceCommit !== 'string' || !/^[0-9a-f]{40}$/.test(sourceCommit)) throw new TypeError('Exact sourceCommit required');
  if (!pipelineResult || pipelineResult.gameId !== gameId || typeof pipelineResult.seed !== 'string' || !pipelineResult.seed)
    throw new TypeError('Pipeline identity and seed must match');
  if (!Array.isArray(pipelineResult.errors) || pipelineResult.errors.length) throw new TypeError('Pipeline errors prevent packaging');
  if (!Array.isArray(pipelineResult.steps) || pipelineResult.steps.length !== ORDER.length) throw new TypeError('Incomplete pipeline trace');
  const steps = pipelineResult.steps;
  for (let i = 0; i < ORDER.length; i++) {
    const s = steps[i], skipped = i === 0 && s?.status === 'skipped_optional';
    if (!s || s.engine !== ORDER[i] || s.ok !== false || (!skipped && s.status !== 'produced_unverified'))
      throw new TypeError('Unexpected pipeline stage/status');
    if (!skipped && (!pipelineResult.outputs || pipelineResult.outputs[s.engine] == null))
      throw new TypeError('Missing actual stage output');
  }
  const entries = fileEntries(files);
  if (!Object.hasOwn(files, 'index.html')) throw new TypeError('index.html entry is required');
  const manifest = { schema_version: 1, game_id: gameId, seed: pipelineResult.seed,
    source_commit: sourceCommit, entry: 'index.html', status: 'packaged_unverified',
    validation: { browser: 'not_run', rights: 'not_verified', publication: 'not_published' },
    pipeline_sha256: hash(canonical(pipelineResult)),
    stages: steps.map(s => ({ engine: s.engine, status: s.status })), files: entries };
  return { manifest, manifest_sha256: hash(canonical(manifest)), files: { ...files } };
}
function verifyArtifact(artifact) {
  try {
    if (!artifact || artifact.manifest_sha256 !== hash(canonical(artifact.manifest))) return false;
    return canonical(fileEntries(artifact.files)) === canonical(artifact.manifest.files);
  } catch { return false; }
}
module.exports = { packArtifact, verifyArtifact };
