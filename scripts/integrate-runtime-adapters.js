#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/app-release-registry.json'), 'utf8'));
const START = '/* WORLD_SERVER_RUNTIME_ADAPTER:START */';
const END = '/* WORLD_SERVER_RUNTIME_ADAPTER:END */';

function rel(file) { return path.relative(ROOT, file).replaceAll('\\', '/'); }
function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function allCode(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) allCode(full, out);
    else if (entry.isFile() && /\.(js|mjs|ts|tsx)$/i.test(entry.name)) out.push(full);
  }
  return out;
}
function certifiedGameIds() {
  return Object.entries(registry.apps || {})
    .filter(([, meta]) => meta?.status === 'certified' && meta?.kind === 'game')
    .map(([id]) => id);
}
function findRenderer(text) {
  const patterns = [
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.WebGLRenderer\s*\(/m,
    /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.WebGLRenderer\s*\(/m
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}
function findCamera(text) {
  const patterns = [
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.(?:PerspectiveCamera|OrthographicCamera)\s*\(/m,
    /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.(?:PerspectiveCamera|OrthographicCamera)\s*\(/m
  ];
  for (const re of patterns) { const m = text.match(re); if (m) return m[1]; }
  return null;
}
function findScene(text) {
  const patterns = [
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.Scene\s*\(/m,
    /\b([A-Za-z_$][\w$]*)\s*=\s*new\s+THREE\.Scene\s*\(/m
  ];
  for (const re of patterns) { const m = text.match(re); if (m) return m[1]; }
  return null;
}
function findStreamingFunction(text) {
  for (const name of ['updateStreaming','loadNeededChunks','streamAround','updateChunks','ensureChunks','streamWorld','loadChunksAround']) {
    if (new RegExp(`function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=`).test(text)) return name;
  }
  return null;
}
function patchVoxelPredictiveStreaming(text) {
  const marker = '/* WORLD_SERVER_PREDICTIVE_CHUNK_CENTER */';
  if (text.includes(marker)) return { text, changed: false, status: 'already-predictive-center' };
  const exact = "if(streamBusy) return; const pcx=floorDiv(player.pos.x,CHUNK),pcz=floorDiv(player.pos.z,CHUNK),need=[];";
  if (!text.includes(exact)) return { text, changed: false, status: 'voxel-stream-center-anchor-not-found' };
  const replacement = `if(streamBusy) return; ${marker}\n  const __wsHint=window.__WORLD_SERVER_STREAM_HINT__;\n  const __wsMaxLead=CHUNK*.95;\n  const __wsX=Number.isFinite(__wsHint?.x)&&Math.abs(__wsHint.x-player.pos.x)<=__wsMaxLead?__wsHint.x:player.pos.x;\n  const __wsZ=Number.isFinite(__wsHint?.z)&&Math.abs(__wsHint.z-player.pos.z)<=__wsMaxLead?__wsHint.z:player.pos.z;\n  const pcx=floorDiv(__wsX,CHUNK),pcz=floorDiv(__wsZ,CHUNK),need=[];`;
  return { text: text.replace(exact, replacement), changed: true, status: 'predictive-center-integrated' };
}
function managedBlock(appId, rendererName, cameraName, sceneName, streamName) {
  const maxDpr = appId === 'voxel-world' ? '1.65' : '2';
  const lines = [
    START,
    `window.WorldServerPWA?.registerRenderer(${rendererName}, { minDpr: 0.65, maxDpr: ${maxDpr}, keepShadows: true, resize: false });`
  ];
  if (cameraName && sceneName) {
    lines.push(`window.WorldServerStutterProfiler?.registerThree({ renderer: ${rendererName}, scene: ${sceneName}, camera: ${cameraName}, prewarm: true });`);
    lines.push(`window.WorldServerPredictiveStreaming?.registerThree({ camera: ${cameraName}, onPrediction: (__p) => { window.__WORLD_SERVER_STREAM_HINT__ = __p; ${streamName ? `try { ${streamName}(${streamName === 'updateStreaming' ? 'true' : ''}); } catch {}` : ''} } });`);
    lines.push(`queueMicrotask(() => { try { window.WorldServerRigAdapters?.scanScene(${sceneName}, { id: '${appId}-scene' }); } catch {} });`);
  }
  if (appId === 'ai3d-voxel-city') {
    lines.push(
      `window.WorldServerGraphicsQuality?.registerAdapter(({ profile: __qProfile }) => {`,
      `  const __map = { performance: 'SAFE', balanced: 'HIGH', high: 'HIGH', ultra: 'ULTRA' };`,
      `  const __next = __map[__qProfile] || 'HIGH';`,
      `  if (profileName !== __next) {`,
      `    profileName = __next;`,
      `    dynamicPixelRatio = Math.min(devicePixelRatio || 1, profile().pixelRatio);`,
      `    try { ${rendererName}.setPixelRatio(dynamicPixelRatio); } catch {}`,
      `    if (world) { try { applyFog(); } catch {} try { updateStreaming(true); } catch {} }`,
      `  }`,
      `});`
    );
  }
  lines.push(END);
  return lines.join('\n');
}
function insertBlock(text, appId, rendererName, cameraName, sceneName, streamName) {
  if (text.includes(START) && text.includes(END)) {
    const start = text.indexOf(START);
    const end = text.indexOf(END, start) + END.length;
    const nextBlock = managedBlock(appId, rendererName, cameraName, sceneName, streamName);
    const currentBlock = text.slice(start, end);
    if (currentBlock === nextBlock) return { text, changed: false, reason: 'already-integrated-v4' };
    return { text: text.slice(0, start) + nextBlock + text.slice(end), changed: true, reason: 'upgraded-managed-block-v4' };
  }
  const escaped = rendererName.replace(/[$]/g, '\\$&');
  const setSize = new RegExp(`${escaped}\\.setSize\\([^;]+;`);
  const match = setSize.exec(text);
  if (!match) return { text, changed: false, reason: 'renderer-setSize-anchor-not-found' };
  const pos = match.index + match[0].length;
  const block = `\n${managedBlock(appId, rendererName, cameraName, sceneName, streamName)}\n`;
  return { text: text.slice(0, pos) + block + text.slice(pos), changed: true, reason: 'integrated' };
}

const report = {
  schemaVersion: '4.0.0',
  generatedAt: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'plan',
  apps: [],
  changes: [],
  unresolved: []
};

for (const appId of certifiedGameIds()) {
  const appDir = path.join(ROOT, 'apps', appId);
  const files = allCode(appDir);
  const candidates = [];
  let integrated = false;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const voxelPatch = appId === 'voxel-world' ? patchVoxelPredictiveStreaming(original) : { text: original, changed: false, status: 'not-voxel-world' };
    const before = voxelPatch.text;
    const rendererName = findRenderer(before);
    if (!rendererName && (before.includes('WorldServerPWA?.registerRenderer') || before.includes('WorldServerPWA.registerRenderer'))) {
      integrated = true;
      candidates.push({ file: rel(file), status: 'legacy-integrated-no-renderer-anchor' });
      continue;
    }
    if (!rendererName) continue;
    const cameraName = findCamera(before);
    const sceneName = findScene(before);
    const streamName = findStreamingFunction(before);
    const result = insertBlock(before, appId, rendererName, cameraName, sceneName, streamName);
    candidates.push({ file: rel(file), rendererName, cameraName, sceneName, streamName, predictiveStreaming: voxelPatch.status, status: result.reason });
    if (!result.changed && result.reason === 'already-integrated-v4' && !voxelPatch.changed) integrated = true;
    const finalChanged = result.changed || voxelPatch.changed;
    if (finalChanged) {
      const change = { appId, file: rel(file), rendererName, predictiveStreaming: voxelPatch.status, before: hash(original), after: hash(result.text), applied: APPLY };
      report.changes.push(change);
      if (APPLY) fs.writeFileSync(file, result.text, 'utf8');
      integrated = true;
      break;
    }
  }
  const rendererCandidates = candidates.filter(x => x.rendererName || /integrated/.test(x.status)).length;
  const unresolved = rendererCandidates > 0 && !integrated;
  report.apps.push({ appId, rendererCandidates, integrated, candidates });
  if (unresolved) report.unresolved.push({ appId, reason: 'renderer-candidate-not-integrated', candidates });
}

report.certifiedApps = report.apps.length;
report.integratedApps = report.apps.filter(x => x.integrated || x.rendererCandidates === 0).length;
report.coverage = report.certifiedApps ? Math.round(report.integratedApps * 1000 / report.certifiedApps) / 10 : 100;
report.pass = report.unresolved.length === 0;
fs.writeFileSync(path.join(ROOT, 'PWA_RUNTIME_ADAPTER_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[RUNTIME_ADAPTERS] mode=${report.mode} coverage=${report.coverage}% changes=${report.changes.length} unresolved=${report.unresolved.length}`);
if (!report.pass) process.exit(84);
