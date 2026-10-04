'use strict';

const crypto = require('crypto');

const VIEW_ROLES = new Set(['front','back','left','right','top','bottom','three-quarter-left','three-quarter-right','custom']);
const TECHNICAL_STATUSES = new Set(['pending','running','verified','failed','blocked']);
const PIPELINE = [
  'inspect-context',
  'camera-calibration',
  'depth-segmentation',
  'geometry-reconstruction',
  'mesh-cleanup',
  'retopology',
  'uv-unwrap',
  'pbr-materials',
  'rig-animation',
  'export-glb',
  'reimport-verify',
  'render-back-compare'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function cleanLabel(value, fallback = 'reference') {
  const text = String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, 96) || fallback;
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function createReference3DAgentState(options = {}) {
  return {
    schemaVersion: '1.0.0',
    capability: 'REFERENCE3D_AGENT',
    phase: 'collect-views',
    freeOnly: options.freeOnly !== false,
    userVerdict: 'UNSET',
    sourceBoundary: {
      method: 'independent-reimplementation',
      studiedProject: 'Mixar-AI/mixar-app',
      studiedRevision: 'edaeb32f28f7b70cd3ba59f906b0e4e1ef40cd55',
      upstreamLicense: 'GPL-family',
      importedUpstreamCode: false
    },
    views: [],
    identityFeatures: [],
    ambiguity: { hiddenGeometry: 'unknown', cameraCalibrationRequired: false },
    sceneInspection: null,
    tasks: [],
    evidence: [],
    correctionPasses: 0,
    maxCorrectionPasses: 3
  };
}

function normalizeLandmarks(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 128).map((item) => ({
    label: cleanLabel(item?.label, 'feature'),
    x: clamp(item?.x, 0, 1),
    y: clamp(item?.y, 0, 1),
    prominence: clamp(item?.prominence, 0, 1)
  }));
}

function normalizeReferenceView(view = {}, index = 0) {
  const role = VIEW_ROLES.has(view.role) ? view.role : 'custom';
  const projection = view.projection === 'orthographic' ? 'orthographic' : 'perspective';
  const width = Math.max(1, Math.min(32768, Math.floor(Number(view.width) || 1)));
  const height = Math.max(1, Math.min(32768, Math.floor(Number(view.height) || 1)));
  return {
    id: cleanLabel(view.id, 'view-' + (index + 1)),
    role,
    projection,
    width,
    height,
    pixelArt: Boolean(view.pixelArt),
    landmarks: normalizeLandmarks(view.landmarks),
    sourceDigest: view.sourceDigest ? String(view.sourceDigest).slice(0, 128) : null
  };
}

function collectIdentityFeatures(views) {
  const byLabel = new Map();
  for (const view of views) {
    for (const mark of view.landmarks) {
      if (mark.prominence < 0.55) continue;
      const row = byLabel.get(mark.label) || { label: mark.label, views: [], prominence: 0 };
      row.views.push(view.role);
      row.prominence = Math.max(row.prominence, mark.prominence);
      byLabel.set(mark.label, row);
    }
  }
  return [...byLabel.values()].map((row) => ({ ...row, views: [...new Set(row.views)] }));
}

function registerReferenceViews(state, inputViews = []) {
  if (!state || state.capability !== 'REFERENCE3D_AGENT') throw new TypeError('REFERENCE3D_AGENT state required');
  const views = (Array.isArray(inputViews) ? inputViews : []).slice(0, 8).map(normalizeReferenceView);
  const distinctRoles = new Set(views.map((view) => view.role));
  const perspective = views.filter((view) => view.projection === 'perspective').length;
  state.views = views;
  state.identityFeatures = collectIdentityFeatures(views);
  state.ambiguity = {
    hiddenGeometry: views.length >= 4 ? 'reduced-not-eliminated' : 'unknown',
    cameraCalibrationRequired: perspective > 0,
    distinctRoles: distinctRoles.size,
    referenceCount: views.length
  };
  state.phase = views.length >= 2 && distinctRoles.size >= 2 ? 'inspect' : 'collect-views';
  state.evidence.push({
    type: 'reference-set',
    referenceCount: views.length,
    distinctRoles: distinctRoles.size,
    perspectiveViews: perspective,
    identityFeatureCount: state.identityFeatures.length
  });
  return state;
}

function chooseReconstructionLane(state) {
  const orthographic = state.views.every((view) => view.projection === 'orthographic');
  const pixel = state.views.length >= 2 && state.views.every((view) => view.pixelArt);
  const roles = new Set(state.views.map((view) => view.role));
  if (orthographic && pixel && roles.has('front') && (roles.has('right') || roles.has('left'))) {
    return { id: 'pixel2world-visual-hull', adapter: 'shared/pixel3d/multiview-voxel.mjs', deterministic: true };
  }
  return {
    id: 'ai3d-multiview',
    adapter: 'services/ai3d-worker',
    providers: state.freeOnly ? ['cpu-existing','Hunyuan3D-free-if-configured','InstantMesh-local-if-configured'] : ['configured-ai3d-providers'],
    deterministic: false
  };
}

function buildReference3DPlan(state, options = {}) {
  if (state.views.length < 2) throw new Error('At least two reference views are required');
  const lane = chooseReconstructionLane(state);
  const calibration = state.ambiguity.cameraCalibrationRequired;
  const animation = Boolean(options.includeAnimation);
  const tasks = PIPELINE.map((id) => ({
    id,
    status: id === 'camera-calibration' && !calibration ? 'verified' : id === 'rig-animation' && !animation ? 'verified' : 'pending',
    adapter: adapterFor(id, lane),
    evidence: []
  }));
  state.tasks = tasks;
  state.phase = 'planned';
  state.evidence.push({ type: 'plan', lane: lane.id, cameraCalibrationRequired: calibration, includeAnimation: animation });
  return { lane, tasks, exportVerification: exportVerificationContract({ expectAnimations: animation }) };
}

function adapterFor(id, lane) {
  const adapters = {
    'inspect-context': 'lib/reference-3d-agent.js',
    'camera-calibration': 'reference-camera-calibration',
    'depth-segmentation': 'Depth Anything + existing segmentation evidence',
    'geometry-reconstruction': lane.adapter,
    'mesh-cleanup': 'services/ai3d-worker/tools/reference3d_blender.py',
    retopology: 'services/ai3d-worker/tools/reference3d_blender.py (deform-safe topology optimization; dedicated retopo provider for deformation loops)',
    'uv-unwrap': 'services/ai3d-worker/tools/reference3d_blender.py',
    'pbr-materials': 'World Server projection/PBR pipeline',
    'rig-animation': 'ActionForge/Quaternius + existing retarget pipeline',
    'export-glb': 'services/ai3d-worker/tools/reference3d_blender.py',
    'reimport-verify': 'services/ai3d-worker/tools/reference3d_blender.py',
    'render-back-compare': 'apps/ai3d-reference-test/render_blender.py + reference fidelity gate'
  };
  return adapters[id] || 'existing-world-server';
}

function inspectScene(state, input = {}) {
  const bounds = Array.isArray(input.bounds) ? input.bounds.slice(0, 6).map(Number) : [];
  const inspection = {
    objectCount: Math.max(0, Math.floor(Number(input.objectCount) || 0)),
    meshCount: Math.max(0, Math.floor(Number(input.meshCount) || 0)),
    faceCount: Math.max(0, Math.floor(Number(input.faceCount) || 0)),
    materialCount: Math.max(0, Math.floor(Number(input.materialCount) || 0)),
    uvLayerCount: Math.max(0, Math.floor(Number(input.uvLayerCount) || 0)),
    animationClipCount: Math.max(0, Math.floor(Number(input.animationClipCount) || 0)),
    nonManifoldEdges: Math.max(0, Math.floor(Number(input.nonManifoldEdges) || 0)),
    bounds: bounds.length === 6 && bounds.every(Number.isFinite) ? bounds : null
  };
  inspection.digest = digest(JSON.stringify(inspection));
  state.sceneInspection = inspection;
  state.evidence.push({ type: 'scene-inspection', ...inspection });
  return inspection;
}

function exportVerificationContract(options = {}) {
  return {
    format: 'GLB',
    useActiveScene: true,
    selectionScoped: true,
    reimportRequired: true,
    reimportIsolation: 'temporary-collection-in-active-scene',
    checks: {
      fileNonEmpty: true,
      finiteWorldBounds: true,
      meshCountStable: true,
      materialPresence: true,
      uvPresence: true,
      nonManifoldEdgesReported: true,
      animationClipsPreserved: Boolean(options.expectAnimations)
    }
  };
}

function recordTaskResult(state, result = {}) {
  const task = state.tasks.find((item) => item.id === result.id);
  if (!task) throw new Error('Unknown REFERENCE3D_AGENT task: ' + result.id);
  const status = TECHNICAL_STATUSES.has(result.status) ? result.status : 'blocked';
  task.status = status;
  task.evidence = Array.isArray(result.evidence) ? result.evidence.slice(0, 32) : [];
  if (status === 'failed') state.correctionPasses += 1;
  if (state.correctionPasses >= state.maxCorrectionPasses) state.phase = 'blocked';
  else if (state.tasks.every((item) => item.status === 'verified')) state.phase = 'technically-verified';
  else state.phase = 'executing';
  state.userVerdict = 'UNSET';
  return state;
}

function buildContextManifest(files = []) {
  return (Array.isArray(files) ? files : []).slice(0, 128).map((file, index) => {
    const name = cleanLabel(file?.name, 'file-' + (index + 1));
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase().slice(0, 16) : '';
    return {
      name,
      extension: ext,
      bytes: Math.max(0, Math.floor(Number(file?.bytes) || 0)),
      sha256: file?.sha256 ? String(file.sha256).slice(0, 64) : null
    };
  });
}

module.exports = {
  VIEW_ROLES,
  createReference3DAgentState,
  normalizeReferenceView,
  registerReferenceViews,
  chooseReconstructionLane,
  buildReference3DPlan,
  inspectScene,
  exportVerificationContract,
  recordTaskResult,
  buildContextManifest
};
