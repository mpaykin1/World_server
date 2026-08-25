#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const APPS = path.join(ROOT, 'apps');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && /\.(js|mjs|ts|tsx|gd)$/i.test(e.name)) out.push(full);
  }
  return out;
}
function rel(file) { return path.relative(ROOT, file).replaceAll('\\', '/'); }
function hit(text, re) { return re.test(text); }

const files = [];
for (const file of walk(APPS)) {
  const text = fs.readFileSync(file, 'utf8');
  const signals = {
    renderer: hit(text, /WebGLRenderer|setPixelRatio|requestAnimationFrame|RenderingServer|SubViewport/i),
    three: hit(text, /\bTHREE\b|three\.module|WebGLRenderer/i),
    lod: hit(text, /\bLOD\b|lodBias|streaming|cull|frustum|drawDistance|visibilityRange/i),
    shadows: hit(text, /shadowMap|castShadow|receiveShadow|shadow[_A-Z]/i),
    particles: hit(text, /Particle|PointsMaterial|GPUParticles|CPUParticles|emitter/i),
    animation: hit(text, /AnimationMixer|SkinnedMesh|Skeleton|\bBone\b|AnimationPlayer|AnimationTree|animat/i),
    feet: hit(text, /leftFoot|rightFoot|foot[_A-Z]|feet|ankle/i),
    weapon: hit(text, /weapon|sword|pistol|rifle|machine.?gun|gun|muzzle|attackDirection|shoot/i),
    shield: hit(text, /shield/i),
    graphicsIntegrated: hit(text, /WorldServerGraphicsQuality|WorldServerPWA\??\.registerRenderer/i),
    animationIntegrated: hit(text, /WorldServerAnimationQuality|WorldServerRigAdapters/i),
    stutterIntegrated: hit(text, /WorldServerStutterProfiler/i),
    predictiveIntegrated: hit(text, /WorldServerPredictiveStreaming/i),
    rigAdapterIntegrated: hit(text, /WorldServerRigAdapters/i)
  };
  if (Object.values(signals).some(Boolean)) files.push({ file: rel(file), signals });
}

const apps = {};
for (const entry of files) {
  const id = entry.file.split('/')[1] || 'unknown';
  const g = apps[id] || (apps[id] = { rendererCandidates: [], semanticCandidates: [], graphicsIntegrated: false, animationIntegrated: false, stutterIntegrated:false, predictiveIntegrated:false, rigAdapterIntegrated:false });
  if (entry.signals.renderer || entry.signals.three || entry.signals.lod || entry.signals.shadows || entry.signals.particles) g.rendererCandidates.push(entry.file);
  if (entry.signals.animation || entry.signals.feet || entry.signals.weapon || entry.signals.shield) g.semanticCandidates.push(entry.file);
  g.graphicsIntegrated ||= entry.signals.graphicsIntegrated;
  g.animationIntegrated ||= entry.signals.animationIntegrated;
  g.stutterIntegrated ||= entry.signals.stutterIntegrated;
  g.predictiveIntegrated ||= entry.signals.predictiveIntegrated;
  g.rigAdapterIntegrated ||= entry.signals.rigAdapterIntegrated;
}

const report = {
  generatedAt: new Date().toISOString(),
  files,
  apps,
  totals: {
    candidateFiles: files.length,
    appsWithRendererCandidates: Object.values(apps).filter(x => x.rendererCandidates.length).length,
    appsWithSemanticCandidates: Object.values(apps).filter(x => x.semanticCandidates.length).length,
    appsGraphicsIntegrated: Object.values(apps).filter(x => x.graphicsIntegrated).length,
    appsAnimationIntegrated: Object.values(apps).filter(x => x.animationIntegrated).length,
    appsStutterIntegrated: Object.values(apps).filter(x => x.stutterIntegrated).length,
    appsPredictiveIntegrated: Object.values(apps).filter(x => x.predictiveIntegrated).length,
    appsRigAdapterIntegrated: Object.values(apps).filter(x => x.rigAdapterIntegrated).length
  }
};
fs.writeFileSync(path.join(ROOT, 'PWA_RUNTIME_INTEGRATION_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[PWA_INTEGRATION_DISCOVERY] files=${report.totals.candidateFiles} rendererApps=${report.totals.appsWithRendererCandidates} semanticApps=${report.totals.appsWithSemanticCandidates} graphicsIntegrated=${report.totals.appsGraphicsIntegrated} animationIntegrated=${report.totals.appsAnimationIntegrated} stutterIntegrated=${report.totals.appsStutterIntegrated} predictiveIntegrated=${report.totals.appsPredictiveIntegrated} rigIntegrated=${report.totals.appsRigAdapterIntegrated}`);
