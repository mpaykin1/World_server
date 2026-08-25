'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TEXTURE = /\.(png|jpg|jpeg|webp|avif|tga|exr|hdr|ktx2|basis)$/i;
const MODEL = /\.(glb|gltf|obj|fbx|dae)$/i;

function stem(file) { return path.basename(file, path.extname(file)).toLowerCase(); }

function inspectAssets(project, config = {}) {
  const files = project.files.filter(fs.existsSync);
  const textures = files.filter(f => TEXTURE.test(f));
  const models = files.filter(f => MODEL.test(f));
  const issues = [];
  const names = textures.map(stem);
  const hasMap = rx => names.some(n => rx.test(n));

  for (const file of textures) {
    const size = fs.statSync(file).size;
    if (size > (config.maxTextureBytes || 16 * 1024 * 1024)) issues.push({ kind: 'oversized-texture', file, size, severity: 'medium' });
    if (size < (config.minUsefulTextureBytes || 1024) && !/icon|pixel|lut/i.test(file)) issues.push({ kind: 'suspiciously-small-texture', file, size, severity: 'low' });
  }
  if (textures.length >= 3) {
    if (!hasMap(/normal|nrm|_n$/)) issues.push({ kind: 'missing-normal-map-family', severity: 'low' });
    if (!hasMap(/rough|roughness|_r$/)) issues.push({ kind: 'missing-roughness-map-family', severity: 'low' });
  }
  const modelBytes = models.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (models.length > 0 && modelBytes > (config.warnModelBytes || 64 * 1024 * 1024)) issues.push({ kind: 'heavy-model-set', bytes: modelBytes, severity: 'medium' });

  const score = Math.max(40, 100 - issues.reduce((n, i) => n + (i.severity === 'medium' ? 8 : 3), 0));
  return { score, textureCount: textures.length, modelCount: models.length, modelBytes, issues };
}

module.exports = { inspectAssets };
