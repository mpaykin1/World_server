'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorldDNA, analyzeReference, analyzeDepthSegmentation, evaluateQualityContract, settingsFromDNA, publicWorld } = require('../lib/world-factory');
const factoryApi = require('../lib/api-handlers/world-factory')._private;

const root = path.resolve(__dirname, '..');
const loreBible = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8').replace(/^\uFEFF/, ''));
const requestId = '123e4567-e89b-42d3-a456-426614174000';

function fakeAdmin() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, 'voxel_worlds');
      let id = null;
      let inserted = null;
      return {
        select() { return this; },
        eq(_key, value) { id = value; return this; },
        async maybeSingle() { return { data: rows.get(id) || null, error: null }; },
        insert(payload) { inserted = { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; rows.set(payload.id, inserted); return this; },
        async single() { return { data: inserted, error: null }; },
        order() { return this; },
        async limit(n) { return { data: [...rows.values()].slice(0, n), error: null }; }
      };
    }
  };
}

test('World Factory creates deterministic playable World DNA with lore and quality floor', () => {
  const a = createWorldDNA({ idea: 'лесной мир с древним замком и рекой', requestId, loreBible });
  const b = createWorldDNA({ idea: 'лесной мир с древним замком и рекой', requestId, loreBible });
  assert.equal(a.id, b.id);
  assert.equal(a.seed, b.seed);
  assert.equal(a.theme, 'forest');
  assert.equal(a.visualProfile.qualityFloor, 85);
  assert.equal(a.visualProfile.pbr, true);
  assert.equal(a.visualProfile.microdetail, true);
  assert.equal(a.lore.connections.length, 1);
  assert.ok(loreBible.worlds[a.lore.connections[0].targetId]);
});

test('reference reconstruction has resumable evidence-gated stages and records hidden geometry', () => {
  const dna = createWorldDNA({ idea: 'reference panorama gothic city', requestId, loreBible });
  const pipeline = dna.referencePipeline;
  assert.equal(pipeline.route, 'img2threejs-staged-to-golden-voxel');
  assert.equal(pipeline.maxCorrectionPasses, 3);
  assert.equal(pipeline.stages.length, 8);
  assert.equal(pipeline.stages[0].status, 'ready');
  assert.ok(pipeline.stages.slice(1).every((stage) => stage.status === 'blocked' && stage.evidence.length === 0));
  assert.equal(pipeline.hiddenGeometry[0].status, 'unknown');
  assert.equal(pipeline.acceptance.minVisibilityPercent, 85);
  assert.equal(pipeline.acceptance.referenceEvidenceRequired, true);
  assert.equal(pipeline.acceptance.runtimeEvidenceRequired, true);
});


test('reference analysis executes evidence gate and only unlocks depth after identity evidence', () => {
  const dna = createWorldDNA({ idea: 'reference panorama gothic city', requestId, loreBible });
  analyzeReference(dna.referencePipeline, { kind: 'panorama360', width: 4096, height: 2048, landmarks: [{ label: 'cathedral silhouette', x: 0.25, y: 0.42, prominence: 0.92 }, { label: 'bridge arch', x: 0.68, y: 0.61, prominence: 0.73 }] });
  const p = dna.referencePipeline; assert.equal(p.stages[0].status, 'complete'); assert.equal(p.stages[1].status, 'ready'); assert.equal(p.identityFeatures.length, 2); assert.equal(p.hiddenGeometry[0].status, 'unknown'); assert.equal(p.stages[0].evidence[0].panoramaValid, true);
});

test('reference analysis rejects malformed 360 evidence without unlocking reconstruction', () => {
  const dna = createWorldDNA({ idea: 'reference panorama gothic city', requestId, loreBible });
  analyzeReference(dna.referencePipeline, { kind: 'panorama360', width: 1200, height: 1000, landmarks: [{ label: 'tower', prominence: 1 }] });
  assert.equal(dna.referencePipeline.stages[0].status, 'needs-correction'); assert.equal(dna.referencePipeline.stages[1].status, 'blocked'); assert.deepEqual(dna.referencePipeline.stages[0].blockers, ['invalid-panorama-aspect']);
});


test('depth and segmentation evidence gate unlocks quality contract only with useful CPU-safe evidence', () => {
  const dna = createWorldDNA({ idea: 'reference panorama gothic city', requestId, loreBible });
  analyzeReference(dna.referencePipeline, { kind: 'panorama360', width: 4096, height: 2048, landmarks: [{ label: 'cathedral', prominence: 0.9 }] });
  analyzeDepthSegmentation(dna.referencePipeline, { depth: { source: 'cpu-depth', coverage: 0.91, confidence: 0.78 }, segmentation: { source: 'browser-segmentation', regions: [{ label: 'architecture', coverage: 0.5, confidence: 0.9 }, { label: 'terrain', coverage: 0.3, confidence: 0.8 }] } });
  const p = dna.referencePipeline; assert.equal(p.stages[1].status, 'complete'); assert.equal(p.stages[2].status, 'ready'); assert.equal(p.stages[1].evidence[0].useful, true); assert.equal(p.stages[1].evidence[1].regionCount, 2);
});

test('weak depth evidence cannot unlock quality contract', () => {
  const dna = createWorldDNA({ idea: 'reference image', requestId, loreBible });
  analyzeReference(dna.referencePipeline, { kind: 'image', width: 1920, height: 1080, landmarks: [{ label: 'tower', prominence: 1 }] });
  analyzeDepthSegmentation(dna.referencePipeline, { depth: { coverage: 0.2, confidence: 0.3 }, segmentation: { regions: [{ label: 'building', coverage: 1, confidence: 0.9 }] } });
  assert.equal(dna.referencePipeline.stages[1].status, 'needs-correction'); assert.equal(dna.referencePipeline.stages[2].status, 'blocked'); assert.deepEqual(dna.referencePipeline.stages[1].blockers, ['insufficient-depth-evidence']);
});

test('quality contract gates geometry on identity, hero detail and visibility', () => {
  const dna=createWorldDNA({idea:'reference city',requestId,loreBible}); const p=dna.referencePipeline;
  analyzeReference(p,{kind:'image',width:1920,height:1080,landmarks:[{label:'tower',prominence:1},{label:'arch',prominence:.9}]});
  analyzeDepthSegmentation(p,{depth:{coverage:.9,confidence:.8},segmentation:{regions:[{label:'building',coverage:.6,confidence:.9},{label:'sky',coverage:.4,confidence:.9}]}});
  evaluateQualityContract(p,{matchedIdentityFeatures:['tower','arch'],detailInventory:[{label:'spire',priority:.9}],visibilityPercent:88});
  assert.equal(p.stages[2].status,'complete'); assert.equal(p.stages[3].status,'ready'); assert.equal(p.qualityContract.identityCoverage,1); assert.equal(p.stages[2].evidence[2].pass,true);
});

test('quality contract blocks geometry below identity threshold', () => {
  const dna=createWorldDNA({idea:'reference city',requestId,loreBible}); const p=dna.referencePipeline;
  analyzeReference(p,{kind:'image',width:1920,height:1080,landmarks:[{label:'tower',prominence:1},{label:'arch',prominence:.9}]});
  analyzeDepthSegmentation(p,{depth:{coverage:.9,confidence:.8},segmentation:{regions:[{label:'building',coverage:.6,confidence:.9},{label:'sky',coverage:.4,confidence:.9}]}});
  evaluateQualityContract(p,{matchedIdentityFeatures:['tower'],detailInventory:[{label:'spire',priority:.9}],visibilityPercent:95});
  assert.equal(p.stages[2].status,'needs-correction'); assert.equal(p.stages[3].status,'blocked'); assert.deepEqual(p.stages[2].blockers,['identity-fidelity-below-contract']);
});
test('World Factory settings are directly playable by the existing voxel runtime', () => {
  const dna = createWorldDNA({ idea: 'острова и маяк', requestId, loreBible });
  const row = { id: dna.id, seed: dna.seed, settings: settingsFromDNA(dna) };
  const world = publicWorld(row);
  assert.equal(world.id, dna.id);
  assert.match(world.playUrl, /^\/apps\/voxel-world\/\?world=world-/);
  assert.equal(world.lore.generated, true);
  assert.equal(world.worldDNA.generator.kind, 'procedural-voxel');
});

test('create is idempotent: retry returns the same persisted world instead of duplicating it', async () => {
  const admin = fakeAdmin();
  const body = { idea: 'горы, снег и крепость', requestId };
  const first = await factoryApi.createWorld(admin, body);
  const second = await factoryApi.createWorld(admin, body);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(first.world.id, second.world.id);
  assert.equal(admin.rows.size, 1);
});

test('user-facing create flow routes every generated world through its own id and realtime channel', () => {
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'shared', 'golden-ui-shell.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(client, /const ACTIVE_WORLD_ID/);
  assert.doesNotMatch(client, /worldId:'main'/);
  assert.match(client, /channel\('voxel:'\+ACTIVE_WORLD_ID/);
  assert.match(shell, /id="goldenCreateWorld"/);
  assert.match(shell, /\/api\/world-factory/);
  assert.match(server, /\['\/api\/world-factory', require\('\.\/lib\/api-handlers\/world-factory'\)\]/);
});
