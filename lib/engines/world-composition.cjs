'use strict';
const { createHash } = require('node:crypto');
const { validateGameArtifact } = require('./game-validation.cjs');
const object = x => !!x && Object.getPrototypeOf(x) === Object.prototype;
function vector(v) {
  if (!object(v) || Object.keys(v).length !== 3 ||
      ['x','y','z'].some(k => !Number.isFinite(v[k]) || Math.abs(v[k]) > 10000))
    throw new TypeError('Finite bounded x/y/z required');
  return { x: v.x, y: v.y, z: v.z };
}
function translated(v, offset) {
  const p = vector(v);
  return vector({ x:p.x+offset.x, y:p.y+offset.y, z:p.z+offset.z });
}
// Only packages owned by the existing local generation service are resolved.
// The operation merges geometry data; never arbitrary files, scripts or URLs.
function combineGeneratedWorlds(input, readArtifact, sourceCommit) {
  if (!object(input) || Object.keys(input).length !== 1 || !Array.isArray(input.parts) ||
      input.parts.length < 2 || input.parts.length > 4)
    throw new TypeError('Two to four generated parts required');
  const parts = input.parts.map(p => {
    if (!object(p) || Object.keys(p).length !== 2 ||
        typeof p.artifact_id !== 'string' || !/^[a-f0-9]{64}$/.test(p.artifact_id))
      throw new TypeError('Only artifact_id and translation accepted');
    return { artifact_id:p.artifact_id, translation:vector(p.translation) };
  });
  let first, physics;
  const solids = [];
  for (const part of parts) {
    const artifact = readArtifact(part.artifact_id);
    if (!validateGameArtifact(artifact, { sourceCommit }).integrity)
      throw new Error('Generated source integrity failure');
    const embedded = artifact.files['index.html'].match(
      /<script type="application\/json" id="game-data">([\s\S]*?)<\/script>/);
    if (!embedded) throw new Error('Generated world data unavailable');
    const data = JSON.parse(embedded[1]);
    if (!first) { first = data; physics = JSON.stringify(data.physics); }
    if (JSON.stringify(data.physics) !== physics)
      throw new Error('Source physics must be compatible');
    if (!Array.isArray(data.world?.solids) || solids.length + data.world.solids.length > 250)
      throw new RangeError('Composition exceeds 250 solids');
    for (const s of data.world.solids) {
      const min = translated(s.min, part.translation), max = translated(s.max, part.translation);
      if (['x','y','z'].some(k => min[k] >= max[k])) throw new Error('Invalid source volume');
      solids.push({ ...structuredClone(s), min, max });
    }
  }
  const world = structuredClone(first.world);
  world.solids = solids;
  world.spawn = translated(world.spawn, parts[0].translation);
  world.sceneMarkers = world.sceneMarkers.map(m => ({ ...m,
    position:translated(m.position, parts[0].translation) }));
  const provenance = { schema_version:1, scope:'generated_world_geometry',
    source_commit:sourceCommit, parts };
  const composition_id = createHash('sha256').update(JSON.stringify(provenance)).digest('hex');
  world.assetComposition = { composition_id, ...provenance };
  if (Buffer.byteLength(JSON.stringify(world), 'utf8') > 60000)
    throw new RangeError('Composed world exceeds data budget');
  return { composition_id, kind:'generated_world_geometry', world,
    source_commit:sourceCommit, external_assets:[], browser:'not_run',
    rights:'not_verified', publication:'not_published',
    scope:'Translated solids; first source physics, spawn and scene markers. No scenario/code/audio merge.' };
}
module.exports = { combineGeneratedWorlds };
