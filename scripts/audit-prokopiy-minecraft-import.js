'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const assets = require('../lib/prokopiy-minecraft-assets');

const ROOT = path.join(__dirname, '..');
const PROV = path.join(ROOT, 'data', 'provenance', 'prokopiy-minecraft');
const OUT = path.join(PROV, 'vno-audit.json');
const VALID_DECISIONS = new Set([
  'IMPORT', 'ADAPT', 'LEARN-REIMPLEMENT', 'PRESERVE-FOR-LATER', 'SKIP'
]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function inspectGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 20 || buf.toString('ascii', 0, 4) !== 'glTF') return { valid: false };
  const version = buf.readUInt32LE(4);
  let offset = 12;
  let json = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4E4F534A) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/g, '').trim());
    offset += 8 + length;
  }
  return {
    valid: version === 2 && !!json,
    version,
    meshes: json?.meshes?.length || 0,
    images: json?.images?.length || 0,
    materials: json?.materials?.length || 0,
    animations: json?.animations?.length || 0
  };
}
function addCheck(checks, id, ok, evidence) {
  checks.push({ id, ok: Boolean(ok), evidence });
}

function audit(options = {}) {
  const inventory = readJson(path.join(PROV, 'source-inventory.json'));
  const manifest = readJson(path.join(PROV, 'import-manifest.json'));
  const permission = readJson(path.join(PROV, 'permission.json'));
  const provenanceReview = readJson(path.join(PROV, 'provenance-review.json'));
  const modelIdentityAudit = readJson(path.join(PROV, 'model-identity-audit.json'));
  const capabilityMap = readJson(path.join(PROV, 'capability-map.json'));
  const catalog = assets.loadCatalog();
  const files = inventory.files;
  const checks = [];

  const unique = new Set(files.map((entry) => entry.source_path));
  const decisionCounts = files.reduce((acc, entry) => {
    acc[entry.decision] = (acc[entry.decision] || 0) + 1;
    return acc;
  }, {});
  addCheck(checks, 'source-inventory-complete',
    files.length === 4367 && unique.size === 4367,
    { tracked: files.length, unique: unique.size });
  addCheck(checks, 'every-source-file-has-valid-decision',
    files.every((entry) => VALID_DECISIONS.has(entry.decision)),
    { decisionCounts });

  let sourceTreeVerification = { state: 'NOT_PROVIDED' };
  if (options.sourceDir) {
    const sourceDir = path.resolve(options.sourceDir);
    const sourceCommit = execFileSync('git', ['-C', sourceDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const rawPaths = execFileSync('git', ['-C', sourceDir, 'ls-files', '-z']);
    const sourcePaths = rawPaths.toString('utf8').split('\0').filter(Boolean);
    const inventoryByPath = new Map(files.map((entry) => [entry.source_path, entry]));
    const missingFromInventory = sourcePaths.filter((entry) => !inventoryByPath.has(entry));
    const missingFromSource = files.filter((entry) => !sourcePaths.includes(entry.source_path)).map((entry) => entry.source_path);
    const sourceHashMismatches = [];
    for (const sourcePath of sourcePaths) {
      const stored = inventoryByPath.get(sourcePath);
      if (!stored) continue;
      const current = sha256(path.join(sourceDir, ...sourcePath.split('/')));
      if (current !== stored.sha256) sourceHashMismatches.push(sourcePath);
    }
    sourceTreeVerification = {
      state: 'CHECKED',
      sourceDirectoryProvided: true,
      sourceCommit,
      sourcePathCount: sourcePaths.length,
      missingFromInventory,
      missingFromSource,
      sourceHashMismatches
    };
    addCheck(checks, 'live-source-tree-matches-pinned-inventory',
      sourceCommit === inventory.sourceCommit &&
        sourcePaths.length === files.length &&
        missingFromInventory.length === 0 &&
        missingFromSource.length === 0 &&
        sourceHashMismatches.length === 0,
      sourceTreeVerification);
  }

  const expectedImports = files.filter((entry) => entry.decision === 'IMPORT');
  addCheck(checks, 'import-set-matches-decisions',
    expectedImports.length === manifest.imports.length && manifest.importedArtifacts === expectedImports.length,
    { classifiedImport: expectedImports.length, manifestImports: manifest.imports.length });
  const badHashes = [];
  for (const item of manifest.imports) {
    const target = path.join(ROOT, item.destination);
    if (!fs.existsSync(target) || sha256(target) !== item.sha256) badHashes.push(item.destination);
  }
  addCheck(checks, 'all-imported-artifacts-exist-and-match-source-hash',
    badHashes.length === 0,
    { checked: manifest.imports.length, badHashes });

  const sourceGlbs = files.filter((entry) => entry.extension === '.glb');
  const importedGlbs = manifest.imports.filter((entry) => entry.destination.endsWith('.glb'));
  const invalidGlbs = [];
  let embeddedImages = 0;
  let animationClips = 0;
  for (const item of importedGlbs) {
    const meta = inspectGlb(path.join(ROOT, item.destination));
    embeddedImages += meta.images || 0;
    animationClips += meta.animations || 0;
    if (!meta.valid || meta.images < 1 || meta.materials < 1) {
      invalidGlbs.push({ destination: item.destination, meta });
    }
  }
  addCheck(checks, 'all-portable-source-models-imported',
    sourceGlbs.length === 177 && importedGlbs.length === sourceGlbs.length,
    { sourceGlbs: sourceGlbs.length, importedGlbs: importedGlbs.length });
  addCheck(checks, 'imported-glbs-are-valid-textured-gltf2',
    invalidGlbs.length === 0,
    { checked: importedGlbs.length, embeddedImages, animationClips, invalidGlbs });
  const catalogCounts = Object.fromEntries(
    ['mobs', 'items', 'entities'].map((kind) => [kind, catalog.models[kind].length])
  );
  addCheck(checks, 'catalog-covers-imported-model-families',
    catalogCounts.mobs === 91 && catalogCounts.items === 55 && catalogCounts.entities === 31,
    catalogCounts);
  const sourceOnlyModels = assets.listSourceOnlyModels();
  addCheck(checks, 'unique-useful-unity-fbx-originals-preserved',
    sourceOnlyModels.length === 14 &&
      sourceOnlyModels.every((entry) => entry.runtimeReady === false && entry.path.endsWith('.fbx')),
    { count: sourceOnlyModels.length, ids: sourceOnlyModels.map((entry) => entry.id) });
  addCheck(checks, 'cross-engine-model-identities-accounted',
    modelIdentityAudit.logicalIdentityUnion.total === 219 &&
      modelIdentityAudit.logicalIdentityUnion.accounted === 219 &&
      modelIdentityAudit.logicalIdentityUnion.imported === 191 &&
      modelIdentityAudit.logicalIdentityUnion.notImported === 28 &&
      modelIdentityAudit.notImportedSummary.unaccounted === 0,
    {
      logicalIdentityUnion: modelIdentityAudit.logicalIdentityUnion,
      notImportedSummary: modelIdentityAudit.notImportedSummary
    });
  addCheck(checks, 'block-atlas-indexed',
    catalog.blockAtlas.layers === 1125 && catalog.blockAtlas.columns === 32,
    catalog.blockAtlas);
  const catalogFiles = assets.verifyCatalogFiles();
  addCheck(checks, 'catalog-references-existing-files', catalogFiles.ok, catalogFiles);

  const mappedSpecies = Object.keys(assets.CREATURE_MODEL_MAP);
  const resolvedSpecies = mappedSpecies.filter((id) => assets.resolveCreatureVisual(id));
  addCheck(checks, 'creature-factory-adapter-resolves-current-species',
    resolvedSpecies.length === mappedSpecies.length,
    { mappedSpecies, resolvedSpecies });

  const disputedImported = provenanceReview.disputedFiles.filter((entry) =>
    manifest.imports.some((item) => item.source_path === entry.source_path));
  addCheck(checks, 'disputed-provenance-files-not-imported',
    !provenanceReview.curatedImportContradictionFound && disputedImported.length === 0,
    { disputedCount: provenanceReview.disputedFiles.length, disputedImported });
  const shaders = files.filter((entry) => entry.type === 'shader');
  const code = files.filter((entry) => entry.type === 'code');
  addCheck(checks, 'shader-source-accounted',
    shaders.length === 20 && shaders.every((entry) => entry.decision === 'LEARN-REIMPLEMENT'),
    { count: shaders.length });
  addCheck(checks, 'code-source-accounted',
    code.length === 416 && code.every((entry) => VALID_DECISIONS.has(entry.decision)),
    { count: code.length });

  addCheck(checks, 'permission-boundary-recorded',
    permission.sourceCommit === inventory.sourceCommit &&
      permission.permissionKind === 'individual-author-permission-with-attribution-condition' &&
      permission.permissionEvidence.includes('issuecomment-5844429213'),
    {
      sourceCommit: permission.sourceCommit,
      permissionEvidence: permission.permissionEvidence,
      permissionKind: permission.permissionKind
    });

  const failed = checks.filter((check) => !check.ok);
  const capabilities = capabilityMap.capabilities.reduce((acc, entry) => {
    acc[entry.decision] = (acc[entry.decision] || 0) + 1;
    return acc;
  }, {});
  return {
    schemaVersion: '1.0.0',
    audit: 'PROKOPIY_MINECRAFT_SOURCE_VS_IMPORT_VNO',
    sourceCommit: inventory.sourceCommit,
    sourceTrackedFiles: files.length,
    sourceTreeVerification,
    decisionCounts,
    importedArtifacts: manifest.importedArtifacts,
    importedModels: manifest.importedModels,
    modelIdentityCoverage: manifest.modelIdentityCoverage,
    sourceModelArtifacts: manifest.sourceModelArtifacts,
    sourceImages: manifest.sourceImages,
    importedStandaloneTextures: manifest.importedStandaloneTextures,
    embeddedModelTextures: embeddedImages,
    modelAnimationClips: animationClips,
    sourceShaders: shaders.length,
    sourceCodeFiles: code.length,
    capabilityDispositionCounts: capabilities,
    checks,
    allChecksPass: failed.length === 0,
    failedChecks: failed.map((check) => check.id),
    falsificationAttempt:
      'Compared the complete git-tracked source tree against the decision inventory, import manifest, hashes, model headers, provenance review, catalog, and a canonical Creature Factory consumer mapping.',
    result: failed.length === 0
      ? 'SOURCE_CLASSIFICATION_COMPLETE_AND_CURATED_IMPORT_SET_MATCHES_MANIFEST'
      : 'COUNTEREXAMPLE_FOUND'
  };
}

if (require.main === module) {
  const sourceFlag = process.argv.indexOf('--source');
  const sourceDir = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : undefined;
  const report = audit({ sourceDir });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (!report.allChecksPass) process.exitCode = 1;
}

module.exports = { audit, inspectGlb, VALID_DECISIONS };
