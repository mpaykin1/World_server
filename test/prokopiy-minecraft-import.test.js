'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { audit, inspectGlb, VALID_DECISIONS } = require('../scripts/audit-prokopiy-minecraft-import');
const assets = require('../lib/prokopiy-minecraft-assets');
const cf = require('../lib/creature-factory');
const { getSpecies } = require('../lib/creature-factory/creature-species');

const ROOT = path.join(__dirname, '..');
const PROV = path.join(ROOT, 'data', 'provenance', 'prokopiy-minecraft');

test('VNO source-vs-import audit covers every tracked source file', () => {
  const report = audit();
  assert.equal(report.sourceTrackedFiles, 4367);
  assert.equal(report.allChecksPass, true, report.failedChecks.join(', '));
  assert.equal(report.failedChecks.length, 0);
  assert.equal(Object.values(report.decisionCounts).reduce((a, b) => a + b, 0), 4367);
  for (const decision of Object.keys(report.decisionCounts)) {
    assert.equal(VALID_DECISIONS.has(decision), true, decision);
  }
});
test('all 177 portable GLBs are imported as valid textured glTF 2.0', () => {
  const catalog = assets.loadCatalog();
  const rows = [...catalog.models.mobs, ...catalog.models.items, ...catalog.models.entities];
  assert.equal(rows.length, 177);
  assert.deepEqual(
    [catalog.models.mobs.length, catalog.models.items.length, catalog.models.entities.length],
    [91, 55, 31]
  );
  for (const model of rows) {
    const rel = model.url.replace(/^\/assets\/voxel\/prokopiy-minecraft\//, '');
    const file = path.join(assets.ROOT, rel);
    const meta = inspectGlb(file);
    assert.equal(meta.valid, true, model.id);
    assert.ok(meta.images >= 1, model.id + ' embedded image');
    assert.ok(meta.materials >= 1, model.id + ' material');
  }
});

test('all 219 cross-engine model identities are accounted without bulk duplication', () => {
  const modelAudit = JSON.parse(fs.readFileSync(path.join(PROV, 'model-identity-audit.json'), 'utf8'));
  assert.equal(modelAudit.logicalIdentityUnion.total, 219);
  assert.equal(modelAudit.logicalIdentityUnion.accounted, 219);
  assert.equal(modelAudit.logicalIdentityUnion.imported, 191);
  assert.equal(modelAudit.logicalIdentityUnion.notImported, 28);
  assert.equal(modelAudit.notImportedSummary.semanticallyCovered, 10);
  assert.equal(modelAudit.notImportedSummary.preservedForLaterUnrealOnly, 18);
  assert.equal(modelAudit.notImportedSummary.unaccounted, 0);

  const sourceOnly = assets.listSourceOnlyModels();
  assert.equal(sourceOnly.length, 14);
  for (const model of sourceOnly) {
    assert.equal(model.runtimeReady, false, model.id);
    assert.ok(model.path.endsWith('.fbx'), model.id);
    assert.ok(fs.existsSync(path.join(ROOT, model.path.replace(/^\//, ''))), model.id);
  }
});

test('Creature Factory consumes curated source models without a second creature engine', () => {
  for (const speciesId of ['slime', 'wolf', 'skeleton', 'bear', 'dragon_wyrmling']) {
    const species = getSpecies(speciesId);
    const creature = cf.createCreature(species, { x: 0, y: 0, z: 0 }, () => 0.5);
    assert.equal(creature.visualAsset.provider, 'prokopiy-minecraft', speciesId);
    assert.ok(creature.visualAsset.url.endsWith('.glb'), speciesId);
    assert.equal(creature.visualAsset.attributionRequired, true);
  }
  const goblin = cf.createCreature(getSpecies('goblin'), { x: 0, y: 0, z: 0 }, () => 0.5);
  assert.equal(goblin.visualAsset, null);
});
test('permission and provenance boundaries remain explicit and fail closed', () => {
  const permission = JSON.parse(fs.readFileSync(path.join(PROV, 'permission.json'), 'utf8'));
  const review = JSON.parse(fs.readFileSync(path.join(PROV, 'provenance-review.json'), 'utf8'));
  assert.equal(permission.sourceCommit, 'ba1dd531528a2aa4bed14d4dd3c18da5730264d2');
  assert.equal(permission.permissionKind, 'individual-author-permission-with-attribution-condition');
  assert.match(permission.permissionEvidence, /issuecomment-5844429213/);
  assert.equal(review.curatedImportContradictionFound, false);
  assert.equal(review.disputedFiles.length, 5);
  for (const item of review.disputedFiles) {
    assert.equal(item.status, 'QUARANTINED_NOT_IMPORTED');
  }
});

test('block atlas and imported catalog are complete on disk', () => {
  const result = assets.verifyCatalogFiles();
  assert.equal(result.ok, true, result.missing.join(', '));
  assert.deepEqual(assets.getBlockAtlas(), {
    provider: 'prokopiy-minecraft',
    imageUrl: '/assets/voxel/prokopiy-minecraft/blocks/blocks_atlas.png',
    metadataUrl: '/assets/voxel/prokopiy-minecraft/blocks/blocks_atlas.json',
    layers: 1125,
    columns: 32
  });
});

test('fresh chats and SUPPORT can discover the curated import from project context', () => {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, '.ai', 'project-context-index.json'), 'utf8'));
  const concept = index.concepts?.prokopiyMinecraftImport;
  assert.equal(concept?.sourceCommit, 'ba1dd531528a2aa4bed14d4dd3c18da5730264d2');
  assert.match(concept?.permissionEvidence || '', /issuecomment-5844429213/);
  assert.ok(concept?.machineFiles?.includes('data/provenance/prokopiy-minecraft/capability-map.json'));
  assert.ok(index.freshChatMandatoryReads?.minecraftImport?.includes('docs/PROKOPIY_MINECRAFT_IMPORT.md'));
  assert.match(index.agentBootstrapRule, /Prokopiy\/Minecraft-import work/);
});
