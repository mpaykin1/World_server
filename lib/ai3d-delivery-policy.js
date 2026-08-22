'use strict';

const fs = require('fs');
const path = require('path');

const AI3D_DELIVERY_POLICY = Object.freeze({
  schema: 'ai3d-scene-delivery-policy-v3',
  goal: 'MAXIMUM_REFERENCE_FIDELITY',
  preferredReferenceMatch: 'AS_CLOSE_TO_1_TO_1_AS_TECHNICALLY_POSSIBLE',
  sceneDeliveryRequired: true,
  diagnosticViewerIsFinalDeliverable: false,
  directPlayableUrlRequired: true,
  forbiddenFinalDeliverables: Object.freeze([
    'STATIC_RENDER_ONLY', 'ORBIT_MODEL_VIEWER_ONLY', 'HEIGHTFIELD_CITY',
    'RELIEF_DOMINANT_CITY', 'BILLBOARD_LIKE_CITY', 'GLB_FILE_WITHOUT_PLAYABLE_SCENE',
    'REFERENCE_COMPARISON_PAGE_WITHOUT_PLAYABLE_SCENE', 'CLAY_RENDER_AS_FINAL_RESULT',
    'SCREENSHOT_AS_FINAL_RESULT'
  ]),
  environmentScene: Object.freeze({
    playable: true, walkable: true, firstPersonOrThirdPersonNavigation: true,
    keyboardMovement: Object.freeze(['WASD', 'ARROW_KEYS']), mouseLook: true,
    pointerLockPreferred: true, collisionRequired: true, gravityOrGroundingRequired: true,
    spawnRequired: true, separateArchitecturalMassesRequired: true,
    publicHttpsSceneUrlRequired: true
  }),
  characterScene: Object.freeze({
    sceneRequired: true, controllableCharacterRequired: true,
    keyboardMovement: Object.freeze(['WASD', 'ARROW_KEYS']), mouseLook: true,
    collisionRequired: true, publicHttpsSceneUrlRequired: true
  }),
  referenceFidelity: Object.freeze({
    compareAgainstOriginalReference: true, independentVerifierRequired: true,
    renderBackRequired: true, frontRenderRequired: true, multiViewRequired: true,
    iterativeCorrectionPreferred: true,
    minimums: Object.freeze({
      structuralSimilarity: 0.40,
      edgeSimilarity: 0.15,
      silhouetteSimilarity: 0.60,
      colorSimilarity: 0.50
    }),
    requiredMetrics: Object.freeze([
      'structural_similarity','edge_similarity','silhouette_similarity','color_similarity',
      'multi_view_geometry_status','walkable_scene_integrity'
    ]),
    heightfieldDominantIsFailureForCity: true,
    reliefDominantIsFailureForCity: true,
    billboardLikeIsFailureForCity: true
  }),
  delivery: Object.freeze({
    resultMustOpenDirectlyIntoPlayableScene: true, controlsMustBeVisible: true,
    referenceComparisonMayBeSecondary: true, diagnosticPagesMayNotBePresentedAsFinalResult: true,
    limitationsMustBeExplicit: true, deliveryManifestRequired: true,
    repositoryReadyStateRequired: true
  })
});

const STATUS_SCHEMA = 'ai3d-final-delivery-status-v1';
const DELIVERY_SCHEMA = 'ai3d-scene-delivery-v1';

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function deliveryPolicyForClient() { return clone(AI3D_DELIVERY_POLICY); }

function loadDeliveryStatus(repoRoot = path.resolve(__dirname, '..')) {
  const statusPath = path.join(repoRoot, 'ai3d-final-delivery.json');
  if (!fs.existsSync(statusPath)) return { schema: STATUS_SCHEMA, status: 'NOT_READY_FOR_FINAL_DELIVERY', finalScenePath: null, reason: 'ai3d-final-delivery.json is missing' };
  try { return JSON.parse(fs.readFileSync(statusPath, 'utf8')); }
  catch (error) { return { schema: STATUS_SCHEMA, status: 'NOT_READY_FOR_FINAL_DELIVERY', finalScenePath: null, reason: `invalid ai3d-final-delivery.json: ${error.message}` }; }
}
function deliveryStatusForClient(repoRoot) { return clone(loadDeliveryStatus(repoRoot)); }

function validateReferenceFidelity(fidelity, { requireVerified = false } = {}) {
  const errors = [];
  if (!fidelity || typeof fidelity !== 'object') return ['referenceFidelity block missing'];
  const status = String(fidelity.status || '');
  if (!['VERIFIED','UNTESTED'].includes(status)) return ['referenceFidelity.status must be VERIFIED or UNTESTED'];
  if (requireVerified && status !== 'VERIFIED') return ['referenceFidelity must be VERIFIED for READY final delivery'];
  if (status === 'VERIFIED') {
    for (const [key, minimum] of Object.entries(AI3D_DELIVERY_POLICY.referenceFidelity.minimums)) {
      const value = Number(fidelity[key]);
      if (!Number.isFinite(value)) errors.push(`referenceFidelity.${key} must be numeric when VERIFIED`);
      else if (value < minimum) errors.push(`referenceFidelity.${key} ${value} is below minimum ${minimum}`);
    }
    if (!fidelity.verifier || typeof fidelity.verifier !== 'string') errors.push('referenceFidelity.verifier is required when VERIFIED');
    if (!/^[0-9a-f]{64}$/.test(String(fidelity.referenceSha256 || ''))) errors.push('referenceFidelity.referenceSha256 must be lowercase SHA256');
    if (!/^[0-9a-f]{64}$/.test(String(fidelity.renderSha256 || ''))) errors.push('referenceFidelity.renderSha256 must be lowercase SHA256');
  }
  return errors;
}

function validateSceneDeliveryManifest(manifest, { requireReadyQuality = false } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest missing'];
  if (manifest.schema !== DELIVERY_SCHEMA) errors.push(`schema must be ${DELIVERY_SCHEMA}`);
  if (manifest.playable !== true) errors.push('playable must be true');
  if (manifest.walkable !== true) errors.push('walkable must be true');
  if (manifest.mouseLook !== true) errors.push('mouseLook must be true');
  if (manifest.collisions !== true) errors.push('collisions must be true');
  if (manifest.grounding !== true) errors.push('grounding must be true');
  if (manifest.playerSpawn !== true) errors.push('playerSpawn must be true');
  const controls = new Set(Array.isArray(manifest.controls) ? manifest.controls.map(String) : []);
  if (!controls.has('WASD')) errors.push('controls must include WASD');
  if (!controls.has('ARROW_KEYS')) errors.push('controls must include ARROW_KEYS');
  if (!controls.has('MOUSE_LOOK')) errors.push('controls must include MOUSE_LOOK');
  const scenePath = String(manifest.publicScenePath || '');
  if (!/^\/apps\/[^/]+\/$/.test(scenePath)) errors.push('publicScenePath must be a direct /apps/<scene>/ path ending with /');
  if (scenePath.includes('ai3d-reference-test')) errors.push('diagnostic reference-test page cannot be final publicScenePath');
  if (manifest.finalPresentation !== 'PLAYABLE_SCENE') errors.push('finalPresentation must be PLAYABLE_SCENE');
  const geometry = String(manifest.multiViewGeometryStatus || '');
  if (!['VERIFIED_VOLUMETRIC','UNTESTED'].includes(geometry)) errors.push('multiViewGeometryStatus must be VERIFIED_VOLUMETRIC or UNTESTED');
  if (requireReadyQuality && geometry !== 'VERIFIED_VOLUMETRIC') errors.push('multiViewGeometryStatus must be VERIFIED_VOLUMETRIC for READY final delivery');
  if (manifest.heightfieldDominant === true) errors.push('heightfieldDominant must be false');
  if (manifest.reliefDominant === true) errors.push('reliefDominant must be false');
  if (manifest.billboardLike === true) errors.push('billboardLike must be false');
  if (Number(manifest.connectedArchitecturalMasses || 0) < 2) errors.push('connectedArchitecturalMasses must be >= 2');
  if (Number(manifest.walkableAreaCells || 0) <= 0) errors.push('walkableAreaCells must be > 0');
  errors.push(...validateReferenceFidelity(manifest.referenceFidelity, { requireVerified: requireReadyQuality }));
  return errors;
}

function validateFinalDeliveryStatus(status, { repoRoot = path.resolve(__dirname, '..') } = {}) {
  const errors = [];
  if (!status || typeof status !== 'object') return ['status missing'];
  if (status.schema !== STATUS_SCHEMA) errors.push(`status.schema must be ${STATUS_SCHEMA}`);
  const state = String(status.status || '');
  if (!['NOT_READY_FOR_FINAL_DELIVERY','READY_FOR_FINAL_DELIVERY'].includes(state)) return [...errors, 'status must be NOT_READY_FOR_FINAL_DELIVERY or READY_FOR_FINAL_DELIVERY'];
  if (state === 'NOT_READY_FOR_FINAL_DELIVERY') {
    if (!status.reason || typeof status.reason !== 'string') errors.push('NOT_READY status requires a reason');
    return errors;
  }
  const finalScenePath = String(status.finalScenePath || '');
  if (!/^\/apps\/[^/]+\/$/.test(finalScenePath)) return [...errors, 'READY status requires finalScenePath=/apps/<scene>/'];
  if (finalScenePath.includes('ai3d-reference-test')) return [...errors, 'READY status cannot point to diagnostic reference-test'];
  const appDir = path.join(repoRoot, finalScenePath.replace(/^\/+|\/+$/g, ''));
  const manifestPath = path.join(appDir, 'scene-delivery.json');
  if (!fs.existsSync(path.join(appDir, 'index.html'))) errors.push(`final scene index missing: ${appDir}`);
  if (!fs.existsSync(path.join(appDir, 'client.js'))) errors.push(`final scene client missing: ${appDir}`);
  if (!fs.existsSync(manifestPath)) return [...errors, `final scene manifest missing: ${manifestPath}`];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    errors.push(...validateSceneDeliveryManifest(manifest, { requireReadyQuality: true }));
    if (manifest.publicScenePath !== finalScenePath) errors.push('scene-delivery.json publicScenePath must equal finalScenePath');
  } catch (error) { errors.push(`scene-delivery.json parse failed: ${error.message}`); }
  return errors;
}

module.exports = {
  AI3D_DELIVERY_POLICY, STATUS_SCHEMA, DELIVERY_SCHEMA,
  deliveryPolicyForClient, loadDeliveryStatus, deliveryStatusForClient,
  validateReferenceFidelity, validateSceneDeliveryManifest, validateFinalDeliveryStatus
};
