'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MATERIAL_SCHEMA_VERSION = '1.0.0';
const TIER_ORDER = ['SAFE', 'BALANCED', 'HIGH', 'ULTRA'];
const SHA256_RE = /^[a-f0-9]{64}$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

function stableStringify(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadPolicy(root = ROOT) {
  return readJson(path.join(root, 'data', 'material-forge', 'policy.json'));
}

function loadMaterialManifests(root = ROOT) {
  const directory = path.join(root, 'data', 'material-forge', 'materials');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b))
    .map(file => ({ file, manifest: readJson(file) }));
}

function isPowerOfTwo(value) {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function finiteInRange(value, min, max) {
  return Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
}

function readImageDimensions(buffer, extension) {
  const ext = extension.toLowerCase();
  if (ext === '.png') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) throw new Error('invalid PNG header');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }
  if (ext === '.ktx2') {
    const signature = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (buffer.length < 28 || !buffer.subarray(0, 12).equals(signature)) throw new Error('invalid KTX2 header');
    return { width: buffer.readUInt32LE(20), height: buffer.readUInt32LE(24), format: 'ktx2' };
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('invalid JPEG header');
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      while (buffer[offset] === 0xff) offset += 1;
      const marker = buffer[offset++];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(offset);
      if (length < 2 || offset + length > buffer.length) break;
      if (sof.has(marker)) return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), format: 'jpeg' };
      offset += length;
    }
    throw new Error('JPEG dimensions not found');
  }
  throw new Error(`unsupported runtime image extension: ${extension}`);
}

function normaliseVariant(variant) {
  return {
    uri: String(variant?.uri || ''),
    width: Number(variant?.width),
    height: Number(variant?.height),
    bytes: Number(variant?.bytes),
    sha256: String(variant?.sha256 || '').toLowerCase(),
    ...(variant?.tier ? { tier: String(variant.tier).toUpperCase() } : {})
  };
}

function normaliseManifest(manifest) {
  const maps = {};
  for (const [channel, raw] of Object.entries(manifest?.maps || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const variants = (Array.isArray(raw) ? raw : [raw]).map(normaliseVariant)
      .sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height) || a.uri.localeCompare(b.uri));
    maps[channel] = variants;
  }
  const parameters = manifest?.parameters || {};
  return {
    schemaVersion: String(manifest?.schemaVersion || ''),
    id: String(manifest?.id || ''),
    displayName: String(manifest?.displayName || ''),
    source: {
      tool: String(manifest?.source?.tool || ''),
      author: String(manifest?.source?.author || ''),
      license: String(manifest?.source?.license || ''),
      ...(manifest?.source?.projectFile ? { projectFile: String(manifest.source.projectFile) } : {})
    },
    materialClass: String(manifest?.materialClass || ''),
    mapping: String(manifest?.mapping || ''),
    match: {
      semantics: [...new Set((manifest?.match?.semantics || []).map(String))].sort(),
      worlds: [...new Set((manifest?.match?.worlds || []).map(String))].sort()
    },
    parameters: {
      roughness: Number(parameters.roughness),
      metalness: Number(parameters.metalness),
      normalStrength: Number(parameters.normalStrength),
      aoStrength: Number(parameters.aoStrength),
      emissiveIntensity: Number(parameters.emissiveIntensity),
      tilingScale: Number(parameters.tilingScale),
      blend: Number(parameters.blend)
    },
    maps,
    priority: Number(manifest?.priority || 0)
  };
}

function runtimeFileFor(root, policy, materialId, uri) {
  if (typeof uri !== 'string' || !uri.startsWith(`${policy.runtimeUriRoot}${materialId}/`)) return null;
  if (/[\\?#%]/.test(uri)) return null;
  const relative = uri.replace(/^\//, '');
  const file = path.resolve(root, relative);
  const materialRoot = path.resolve(root, policy.runtimeRoot, materialId);
  if (file !== materialRoot && !file.startsWith(`${materialRoot}${path.sep}`)) return null;
  return file;
}

function validateManifest(input, options = {}) {
  const root = options.root || ROOT;
  const policy = options.policy || loadPolicy(root);
  const verifyFiles = options.verifyFiles !== false;
  const manifest = normaliseManifest(input);
  const errors = [];
  const add = message => errors.push(message);

  if (manifest.schemaVersion !== policy.schemaVersion || manifest.schemaVersion !== MATERIAL_SCHEMA_VERSION) add('schemaVersion must match Material Forge policy');
  if (!ID_RE.test(manifest.id)) add('id must be lowercase kebab-case');
  if (!manifest.displayName || manifest.displayName.length > 80) add('displayName must contain 1-80 characters');
  if (!policy.allowedSources.includes(manifest.source.tool)) add(`source.tool is not allowed: ${manifest.source.tool}`);
  if (!manifest.source.author || manifest.source.author.length > 120) add('source.author is required');
  if (!manifest.source.license || manifest.source.license.length > 120) add('source.license is required');
  if (manifest.source.tool === 'ArmorPaint') {
    if (!manifest.source.projectFile || !/^[^/\\]+\.arm$/i.test(manifest.source.projectFile)) add('ArmorPaint source.projectFile must be a safe .arm filename');
    if (!manifest.maps.baseColor?.length) add('ArmorPaint material requires a baseColor map');
    if (!manifest.maps.normal?.length && !manifest.maps.orm?.length) add('ArmorPaint material requires normal or ORM PBR evidence');
  }
  if (!policy.allowedMaterialClasses.includes(manifest.materialClass)) add(`materialClass is not allowed: ${manifest.materialClass}`);
  if (!policy.allowedMappings.includes(manifest.mapping)) add(`mapping is not allowed: ${manifest.mapping}`);
  if (!manifest.match.semantics.length || manifest.match.semantics.some(item => !policy.allowedMaterialClasses.includes(item))) add('match.semantics must contain allowed semantic names');
  if (!manifest.match.worlds.length || manifest.match.worlds.some(item => item !== '*' && !ID_RE.test(item))) add('match.worlds must contain * or safe world ids');
  if (!finiteInRange(manifest.priority, 0, 1000)) add('priority must be between 0 and 1000');

  const ranges = {
    roughness: [0, 1], metalness: [0, 1], normalStrength: [0, 2], aoStrength: [0, 1],
    emissiveIntensity: [0, 8], tilingScale: [0.1, 64], blend: [0, 1]
  };
  for (const [key, [min, max]] of Object.entries(ranges)) if (!finiteInRange(manifest.parameters[key], min, max)) add(`parameters.${key} must be between ${min} and ${max}`);

  let totalBytes = 0;
  let mapCount = 0;
  for (const [channel, variants] of Object.entries(manifest.maps)) {
    const channelPolicy = policy.channels[channel];
    if (!channelPolicy) { add(`unsupported channel: ${channel}`); continue; }
    if (!variants.length) add(`channel ${channel} has no variants`);
    const tierSeen = new Set();
    for (const variant of variants) {
      mapCount += 1;
      const file = runtimeFileFor(root, policy, manifest.id, variant.uri);
      if (!file) add(`${channel}: uri must stay under ${policy.runtimeUriRoot}${manifest.id}/`);
      const extension = path.extname(variant.uri).toLowerCase();
      if (!policy.allowedExtensions.includes(extension)) add(`${channel}: unsupported extension ${extension || '(none)'}`);
      if (!Number.isInteger(variant.width) || !Number.isInteger(variant.height) || variant.width < 1 || variant.height < 1) add(`${channel}: invalid dimensions`);
      if (variant.width > policy.maxRuntimeDimension || variant.height > policy.maxRuntimeDimension) add(`${channel}: runtime dimensions exceed ${policy.maxRuntimeDimension}; 16K is forbidden`);
      if (policy.requirePowerOfTwo && (!isPowerOfTwo(variant.width) || !isPowerOfTwo(variant.height))) add(`${channel}: dimensions must be powers of two`);
      if (!Number.isInteger(variant.bytes) || variant.bytes < 1 || variant.bytes > policy.maxFileBytes) add(`${channel}: bytes exceed per-file budget`);
      if (!SHA256_RE.test(variant.sha256)) add(`${channel}: valid sha256 is required`);
      if (variant.tier && !TIER_ORDER.includes(variant.tier)) add(`${channel}: invalid tier ${variant.tier}`);
      if (variant.tier && tierSeen.has(variant.tier)) add(`${channel}: duplicate ${variant.tier} tier variant`);
      if (variant.tier) tierSeen.add(variant.tier);
      totalBytes += Number.isInteger(variant.bytes) ? variant.bytes : 0;
      if (verifyFiles && file && fs.existsSync(file)) {
        const buffer = fs.readFileSync(file);
        if (buffer.length !== variant.bytes) add(`${channel}: byte count does not match ${variant.uri}`);
        if (sha256(buffer) !== variant.sha256) add(`${channel}: sha256 does not match ${variant.uri}`);
        try {
          const dimensions = readImageDimensions(buffer, extension);
          if (dimensions.width !== variant.width || dimensions.height !== variant.height) add(`${channel}: dimensions do not match ${variant.uri}`);
        } catch (error) { add(`${channel}: ${error.message}`); }
      } else if (verifyFiles && file) add(`${channel}: file does not exist ${variant.uri}`);
    }
  }
  if (mapCount > policy.maxMapsPerMaterial) add(`material has more than ${policy.maxMapsPerMaterial} map variants`);
  if (totalBytes > policy.maxMaterialBytes) add(`material exceeds ${policy.maxMaterialBytes} byte budget`);

  return { ok: errors.length === 0, errors, manifest, metrics: { mapCount, totalBytes } };
}

function compileRegistry(options = {}) {
  const root = options.root || ROOT;
  const policy = options.policy || loadPolicy(root);
  const records = options.records || loadMaterialManifests(root);
  const materials = {};
  const errors = [];
  for (const record of records) {
    const result = validateManifest(record.manifest, { root, policy, verifyFiles: options.verifyFiles !== false });
    if (!result.ok) errors.push(...result.errors.map(error => `${path.basename(record.file || result.manifest.id)}: ${error}`));
    if (materials[result.manifest.id]) errors.push(`duplicate material id: ${result.manifest.id}`);
    materials[result.manifest.id] = result.manifest;
  }
  if (errors.length) return { ok: false, errors, registry: null };
  const sortedMaterials = Object.fromEntries(Object.entries(materials).sort(([a], [b]) => a.localeCompare(b)));
  const sourceHash = sha256(stableStringify({ policy, materials: sortedMaterials }));
  const registry = {
    schemaVersion: MATERIAL_SCHEMA_VERSION,
    system: 'WORLD_MATERIAL_FORGE',
    policy: {
      runtimeUriRoot: policy.runtimeUriRoot,
      maxRuntimeDimension: policy.maxRuntimeDimension,
      channels: policy.channels,
      tiers: policy.tiers,
      guards: policy.guards
    },
    sourceHash,
    materials: sortedMaterials
  };
  return { ok: true, errors: [], registry };
}

function detectChannel(filename, policy) {
  const basename = path.basename(filename, path.extname(filename)).toLowerCase();
  const compact = basename.replace(/[^a-z0-9]+/g, '');
  const matches = Object.entries(policy.channels).filter(([, channel]) => channel.aliases.some(alias => compact.includes(alias.replace(/[^a-z0-9]+/g, ''))));
  if (matches.length !== 1) return null;
  return matches[0][0];
}

function detectTier(filename) {
  const match = path.basename(filename, path.extname(filename)).toUpperCase().match(/(?:^|[_\-.])(SAFE|BALANCED|HIGH|ULTRA)(?:$|[_\-.])/);
  return match?.[1] || null;
}

function importArmorPaintFolder(options = {}) {
  const root = options.root || ROOT;
  const policy = options.policy || loadPolicy(root);
  const id = String(options.id || '');
  if (!ID_RE.test(id)) throw new Error('ArmorPaint import id must be lowercase kebab-case');
  const sourceDirectory = path.resolve(root, String(options.sourceDirectory || ''));
  const expectedDirectory = path.resolve(root, policy.runtimeRoot, id);
  if (sourceDirectory !== expectedDirectory) throw new Error(`ArmorPaint exports must be placed in ${path.relative(root, expectedDirectory)}`);
  const entries = fs.readdirSync(sourceDirectory, { withFileTypes: true });
  if (entries.some(entry => entry.isSymbolicLink?.())) throw new Error('symbolic links are forbidden in material exports');
  const maps = {};
  for (const entry of entries.filter(item => item.isFile()).sort((a, b) => a.name.localeCompare(b.name))) {
    const extension = path.extname(entry.name).toLowerCase();
    if (!policy.allowedExtensions.includes(extension)) continue;
    const channel = detectChannel(entry.name, policy);
    if (!channel) continue;
    const file = path.join(sourceDirectory, entry.name);
    const buffer = fs.readFileSync(file);
    const dimensions = readImageDimensions(buffer, extension);
    const relative = path.relative(root, file).split(path.sep).join('/');
    (maps[channel] ||= []).push({
      uri: `/${relative}`,
      width: dimensions.width,
      height: dimensions.height,
      bytes: buffer.length,
      sha256: sha256(buffer),
      ...(detectTier(entry.name) ? { tier: detectTier(entry.name) } : {})
    });
  }
  const manifest = {
    schemaVersion: MATERIAL_SCHEMA_VERSION,
    id,
    displayName: String(options.displayName || id),
    source: {
      tool: 'ArmorPaint',
      author: String(options.author || ''),
      license: String(options.license || ''),
      projectFile: String(options.projectFile || `${id}.arm`)
    },
    materialClass: String(options.materialClass || 'default'),
    mapping: String(options.mapping || 'triplanar'),
    match: {
      semantics: options.semantics || [String(options.materialClass || 'default')],
      worlds: options.worlds || ['*']
    },
    parameters: {
      roughness: Number(options.roughness ?? 0.8),
      metalness: Number(options.metalness ?? 0),
      normalStrength: Number(options.normalStrength ?? 0.5),
      aoStrength: Number(options.aoStrength ?? 0.7),
      emissiveIntensity: Number(options.emissiveIntensity ?? 0),
      tilingScale: Number(options.tilingScale ?? 4),
      blend: Number(options.blend ?? 1)
    },
    maps,
    priority: Number(options.priority ?? 100)
  };
  const result = validateManifest(manifest, { root, policy, verifyFiles: true });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.manifest;
}

module.exports = {
  MATERIAL_SCHEMA_VERSION,
  TIER_ORDER,
  compileRegistry,
  detectChannel,
  detectTier,
  importArmorPaintFolder,
  isPowerOfTwo,
  loadMaterialManifests,
  loadPolicy,
  normaliseManifest,
  readImageDimensions,
  sha256,
  stableStringify,
  validateManifest
};
