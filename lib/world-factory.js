'use strict';

const crypto = require('crypto');

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THEMES = ['forest', 'mountains', 'islands', 'desert', 'snow', 'gothic', 'steampunk', 'ruins'];

function cleanIdea(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function cleanTitle(value) {
  const title = cleanIdea(value).slice(0, 64);
  return title || 'Новый мир';
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function pickTheme(idea, hex) {
  const text = idea.toLocaleLowerCase('ru-RU');
  const rules = [
    [/лес|forest|джунг|jungle/, 'forest'], [/гор|mountain|скал|rock/, 'mountains'],
    [/остров|island|океан|ocean|море|sea/, 'islands'], [/пустын|desert|песок|sand/, 'desert'],
    [/снег|snow|лед|ice/, 'snow'], [/гот|goth/, 'gothic'], [/стим|steam|механ|gear/, 'steampunk'],
    [/руин|ruin|древн|ancient/, 'ruins']
  ];
  for (const [pattern, theme] of rules) if (pattern.test(text)) return theme;
  return THEMES[parseInt(hex.slice(0, 8), 16) % THEMES.length];
}

function worldIdFromRequest(requestId) {
  if (!REQUEST_ID.test(String(requestId || ''))) throw Object.assign(new Error('requestId must be a UUID'), { status: 400 });
  return `world-${digest(requestId).slice(0, 16)}`;
}

function chooseAnchor(worldId, loreBible) {
  const ids = Object.keys(loreBible?.worlds || {}).filter((id) => WORLD_ID.test(id) && id !== worldId).sort();
  if (!ids.length) return null;
  return ids[parseInt(digest(worldId).slice(0, 8), 16) % ids.length];
}

function createReferencePipelineState() {
  const names = ['reference-analysis','depth-segmentation-landmarks','quality-contract','geometry-reconstruction','projection-pbr','world-completion','runtime-optimization','visual-correction'];
  return {
    schemaVersion: '1.0.0', route: 'img2threejs-staged-to-golden-voxel', maxCorrectionPasses: 3,
    stages: names.map((name, index) => ({ name, order: index + 1, status: index === 0 ? 'ready' : 'blocked', attempts: 0, evidence: [], blockers: index === 0 ? [] : [names[index - 1]], completedAt: null })),
    identityFeatures: [], hiddenGeometry: [{ region: 'unobserved', status: 'unknown', assumption: null }],
    acceptance: { referenceEvidenceRequired: true, runtimeEvidenceRequired: true, minVisibilityPercent: 85, preserveGoldenGraphics: true }
  };
}


function normalizeReferenceInput(input = {}) {
  const kind = input.kind === 'panorama360' ? 'panorama360' : 'image';
  const width = Math.max(1, Math.min(32768, Number(input.width) || 1));
  const height = Math.max(1, Math.min(16384, Number(input.height) || 1));
  const landmarks = Array.isArray(input.landmarks) ? input.landmarks.slice(0, 64).map((item) => ({ label: cleanTitle(item?.label || 'feature'), x: Math.max(0, Math.min(1, Number(item?.x) || 0)), y: Math.max(0, Math.min(1, Number(item?.y) || 0)), prominence: Math.max(0, Math.min(1, Number(item?.prominence) || 0)) })) : [];
  return { kind, width, height, aspect: Number((width / height).toFixed(4)), landmarks };
}

function analyzeReference(pipeline, input = {}) {
  if (!pipeline?.stages?.length) throw new TypeError('reference pipeline required');
  const stage = pipeline.stages[0];
  if (stage.status === 'complete') return pipeline;
  if (stage.attempts >= pipeline.maxCorrectionPasses) { stage.status = 'blocked'; stage.blockers = ['correction-budget-exhausted']; return pipeline; }
  const ref = normalizeReferenceInput(input); stage.attempts += 1;
  const panoramaValid = ref.kind !== 'panorama360' || Math.abs(ref.aspect - 2) <= 0.08;
  stage.evidence = [{ type: 'reference-metadata', kind: ref.kind, width: ref.width, height: ref.height, aspect: ref.aspect, panoramaValid }, { type: 'identity-landmarks', count: ref.landmarks.length, labels: ref.landmarks.map((item) => item.label) }];
  pipeline.identityFeatures = ref.landmarks.filter((item) => item.prominence >= 0.55);
  pipeline.hiddenGeometry = ref.kind === 'panorama360' ? [{ region: 'occluded-surfaces', status: 'unknown', assumption: null }] : [{ region: 'outside-camera-frustum', status: 'unknown', assumption: null }, { region: 'occluded-surfaces', status: 'unknown', assumption: null }];
  const enoughEvidence = panoramaValid && ref.width > 1 && ref.height > 1 && pipeline.identityFeatures.length > 0;
  stage.status = enoughEvidence ? 'complete' : 'needs-correction'; stage.blockers = enoughEvidence ? [] : [!panoramaValid ? 'invalid-panorama-aspect' : 'missing-identity-evidence']; stage.completedAt = enoughEvidence ? new Date().toISOString() : null;
  if (enoughEvidence) { const next = pipeline.stages[1]; next.status = 'ready'; next.blockers = []; }
  return pipeline;
}

function analyzeDepthSegmentation(pipeline, input = {}) {
  if (!pipeline?.stages?.length) throw new TypeError('reference pipeline required');
  const prior = pipeline.stages[0]; const stage = pipeline.stages[1];
  if (prior.status !== 'complete') { stage.status = 'blocked'; stage.blockers = ['reference-analysis']; return pipeline; }
  if (stage.status === 'complete') return pipeline;
  if (stage.attempts >= pipeline.maxCorrectionPasses) { stage.status = 'blocked'; stage.blockers = ['correction-budget-exhausted']; return pipeline; }
  stage.attempts += 1;
  const depth = input.depth || {}; const segmentation = input.segmentation || {};
  const depthCoverage = Math.max(0, Math.min(1, Number(depth.coverage) || 0));
  const depthConfidence = Math.max(0, Math.min(1, Number(depth.confidence) || 0));
  const segments = Array.isArray(segmentation.regions) ? segmentation.regions.slice(0, 128).map((r) => ({ label: cleanTitle(r?.label || 'region'), coverage: Math.max(0, Math.min(1, Number(r?.coverage) || 0)), confidence: Math.max(0, Math.min(1, Number(r?.confidence) || 0)) })) : [];
  const usefulSegments = segments.filter((r) => r.coverage > 0 && r.confidence >= 0.5);
  const depthUseful = depthCoverage >= 0.65 && depthConfidence >= 0.55;
  const segmentationUseful = usefulSegments.length >= 2;
  stage.evidence = [{ type: 'depth-evidence', source: String(depth.source || 'cpu-or-browser'), coverage: depthCoverage, confidence: depthConfidence, useful: depthUseful }, { type: 'segmentation-evidence', source: String(segmentation.source || 'cpu-or-browser'), regionCount: usefulSegments.length, regions: usefulSegments, useful: segmentationUseful }];
  const enoughEvidence = depthUseful && segmentationUseful;
  stage.status = enoughEvidence ? 'complete' : 'needs-correction';
  stage.blockers = enoughEvidence ? [] : [!depthUseful ? 'insufficient-depth-evidence' : 'insufficient-segmentation-evidence'];
  stage.completedAt = enoughEvidence ? new Date().toISOString() : null;
  if (enoughEvidence) { const next = pipeline.stages[2]; next.status = 'ready'; next.blockers = []; }
  return pipeline;
}

function evaluateQualityContract(pipeline, input = {}) {
  if (!pipeline?.stages?.length) throw new TypeError('reference pipeline required');
  const prior = pipeline.stages[1], stage = pipeline.stages[2];
  if (prior.status !== 'complete') { stage.status = 'blocked'; stage.blockers = ['depth-segmentation-landmarks']; return pipeline; }
  if (stage.status === 'complete') return pipeline;
  if (stage.attempts >= pipeline.maxCorrectionPasses) { stage.status = 'blocked'; stage.blockers = ['correction-budget-exhausted']; return pipeline; }
  stage.attempts += 1;
  const required = pipeline.identityFeatures.length;
  const matched = new Set(Array.isArray(input.matchedIdentityFeatures) ? input.matchedIdentityFeatures.map(cleanTitle) : []);
  const matchedCount = pipeline.identityFeatures.filter((f) => matched.has(f.label)).length;
  const identityCoverage = required ? matchedCount / required : 0;
  const details = Array.isArray(input.detailInventory) ? input.detailInventory.slice(0,128).map((d) => ({ label: cleanTitle(d?.label || 'detail'), priority: Math.max(0,Math.min(1,Number(d?.priority)||0)), representation: String(d?.representation || 'voxel').slice(0,32) })) : [];
  const visibilityPercent = Math.max(0,Math.min(100,Number(input.visibilityPercent)||0));
  const identityPass = identityCoverage >= 0.85, inventoryPass = details.some((d) => d.priority >= 0.7), visibilityPass = visibilityPercent >= pipeline.acceptance.minVisibilityPercent;
  stage.evidence = [{ type:'identity-coverage', required, matched:matchedCount, coverage:Number(identityCoverage.toFixed(4)), pass:identityPass }, { type:'detail-inventory', count:details.length, heroCount:details.filter((d)=>d.priority>=0.7).length, items:details, pass:inventoryPass }, { type:'technology-visibility', percent:visibilityPercent, minimum:pipeline.acceptance.minVisibilityPercent, pass:visibilityPass }];
  pipeline.qualityContract = { identityCoverage:Number(identityCoverage.toFixed(4)), detailInventory:details, visibilityPercent, hiddenGeometryPolicy:'preserve-unknown-until-evidenced' };
  const pass = identityPass && inventoryPass && visibilityPass;
  stage.status = pass ? 'complete' : 'needs-correction';
  stage.blockers = pass ? [] : [!identityPass ? 'identity-fidelity-below-contract' : !inventoryPass ? 'missing-hero-detail-inventory' : 'technology-visibility-below-contract'];
  stage.completedAt = pass ? new Date().toISOString() : null;
  if (pass) { pipeline.stages[3].status='ready'; pipeline.stages[3].blockers=[]; }
  return pipeline;
}
function createWorldDNA({ idea, requestId, loreBible } = {}) {
  const clean = cleanIdea(idea);
  if (clean.length < 3) throw Object.assign(new Error('Опишите мир хотя бы тремя символами.'), { status: 400 });
  const id = worldIdFromRequest(requestId);
  const hex = digest(`${requestId}\n${clean}`);
  const seed = (parseInt(hex.slice(0, 8), 16) & 0x7fffffff) || 1;
  const title = cleanTitle(clean.split(/[.!?]/)[0]);
  const theme = pickTheme(clean, hex);
  const anchorId = chooseAnchor(id, loreBible);
  const anchorTitle = anchorId ? String(loreBible?.worlds?.[anchorId]?.headline || anchorId).slice(0, 90) : '';
  const connectionStory = anchorId
    ? `В этом мире найден след, связанный с миром «${anchorTitle}». Игроки могут изменить смысл этой связи своими действиями.`
    : 'Этот мир становится первой главой новой ветви общей истории.';
  const lore = {
    headline: `${title}: новая глава общей вселенной`,
    lore: `Мир родился из идеи игрока: «${clean}». В нём есть тайна, опасность, цель и выбор. То, что сделают игроки, может стать частью общего канона.`,
    history: 'Мир создан World Factory и сразу включён в общую историю World_server.',
    elements: ['mystery','puzzle','danger','goal','worldRule','stakes','entity','choice','twist','connection','gameplayHook','openQuestion'],
    connections: anchorId ? [{ targetId: anchorId, story: connectionStory }] : [],
    generated: true,
    generator: 'world-factory-v1'
  };
  return {
    schemaVersion: '1.0.0', id, requestId, title, idea: clean, seed, theme,
    generator: { kind: 'procedural-voxel', version: 1, chunkSize: 16, minY: -16, maxY: 96 },
    visualProfile: { qualityFloor: 85, atmosphere: true, pbr: true, microdetail: true, water: true, adaptivePerformance: true },
    referencePipeline: createReferencePipelineState(),
    lore,
    createdAt: new Date().toISOString()
  };
}

function settingsFromDNA(dna) {
  return {
    name: dna.title,
    chunkSize: dna.generator.chunkSize,
    minY: dna.generator.minY,
    maxY: dna.generator.maxY,
    generatorVersion: dna.generator.version,
    theme: dna.theme,
    worldDNA: dna,
    lore: dna.lore
  };
}

function publicWorld(row) {
  const dna = row?.settings?.worldDNA;
  if (!dna || dna.generator?.kind !== 'procedural-voxel') return null;
  return {
    id: row.id,
    title: row.settings?.name || dna.title || row.id,
    seed: Number(row.seed),
    theme: row.settings?.theme || dna.theme || 'forest',
    lore: row.settings?.lore || dna.lore || null,
    worldDNA: dna,
    playUrl: `/apps/voxel-world/?world=${encodeURIComponent(row.id)}`
  };
}

module.exports = { cleanIdea, cleanTitle, digest, pickTheme, worldIdFromRequest, chooseAnchor, createReferencePipelineState, normalizeReferenceInput, analyzeReference, analyzeDepthSegmentation, evaluateQualityContract, createWorldDNA, settingsFromDNA, publicWorld };
