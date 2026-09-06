#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT, STATE_DIR, norm, ensureDir, shaBuffer, shaFile, readJSON, writeJSON, projectFiles, nowIso, safeLabel
} = require('./integration-utils.cjs');

const CAS_ROOT = path.join(STATE_DIR, 'cas', 'sha256');
const SNAP_ROOT = path.join(STATE_DIR, 'snapshots');
const GC_RECOVERY_DIR = path.join(STATE_DIR, 'cas-gc-recovery');
const GB = 1024 * 1024 * 1024;
const EMERGENCY_BLOCK_FILE = path.join(ROOT, 'CAS_EMERGENCY_BLOCK.json');
const GC_ALARM_FILE = path.join(ROOT, 'CAS_GC_ALARM.json');
const GC_STATUS_FILE = path.join(ROOT, 'CAS_GC_STATUS.json');
ensureDir(CAS_ROOT); ensureDir(SNAP_ROOT);

function objectPath(hash) { return path.join(CAS_ROOT, hash.slice(0, 2), hash.slice(2)); }
function storeObject(abs, hash) {
  const dst = objectPath(hash);
  if (!fs.existsSync(dst) || shaFile(dst) !== hash) { ensureDir(path.dirname(dst)); fs.copyFileSync(abs, dst); }
  return dst;
}
function merkleRoot(entries) {
  let level = entries.slice().sort((a,b) => a.path.localeCompare(b.path)).map(e => shaBuffer(Buffer.from(`leaf\0${e.path}\0${e.sha256}\0${e.bytes}`)));
  if (!level.length) return shaBuffer(Buffer.alloc(0));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i], right = level[i + 1] || left;
      next.push(shaBuffer(Buffer.from(`node\0${left}\0${right}`)));
    }
    level = next;
  }
  return level[0];
}
function resolveRelative(fromRel, spec, known) {
  if (!spec || !(spec.startsWith('./') || spec.startsWith('../'))) return null;
  const base = norm(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec)));
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, `${base}.json`, `${base}.css`, `${base}.html`, `${base}.py`, `${base}/index.js`, `${base}/index.cjs`, `${base}/index.mjs`, `${base}/__init__.py`];
  return candidates.find(x => known.has(x)) || null;
}
function extractSpecs(rel, text) {
  const specs = new Set();
  const ext = path.extname(rel).toLowerCase();
  const addMatches = re => { let m; while ((m = re.exec(text))) specs.add(m[1]); };
  if (['.js','.cjs','.mjs','.jsx','.ts','.tsx'].includes(ext)) {
    addMatches(/(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g);
  } else if (ext === '.css') {
    addMatches(/@import\s+(?:url\()?['"]?([^'"\)\s]+)|url\(\s*['"]?([^'"\)]+?)["']?\s*\)/g);
  } else if (['.html','.htm'].includes(ext)) {
    addMatches(/(?:src|href)\s*=\s*['"]([^'"]+)['"]/g);
  } else if (ext === '.py') {
    addMatches(/^from\s+(\.+[\w.]*)\s+import\s+/gm);
  } else if (ext === '.json') {
    try {
      const obj = JSON.parse(text);
      (function walk(v){
        if (typeof v === 'string' && (v.startsWith('./') || v.startsWith('../'))) specs.add(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      })(obj);
    } catch {}
  }
  return [...specs].filter(Boolean);
}

// ---------------------------------------------------------------------------
// CAS garbage-collection: configuration, observability and safety helpers.
//
// Root cause of unbounded CAS growth (see WORK_IN_PROGRESS.md incident notes):
// every snapshot() call content-addresses and stores a copy of the *entire*
// project tree, and this repo has hundreds of frequently-rewritten report/
// status JSON files. Snapshots are created automatically, very frequently
// (system-control-plane.cjs runs `snapshot` as a step, and is itself invoked
// every scheduler tick by scripts/autonomous-blocker-repair.cjs), so distinct
// CAS objects accumulate forever unless something reaps the ones no longer
// referenced by any retained snapshot. Nothing did. gc() existed but was a
// purely manual command that nobody ever wired up.
//
// The fix lives here, in the one function (`snapshot`) and one code path
// (`buildIndex({store:true})`) that every producer of CAS growth already
// funnels through, rather than as a separate daemon/process.
// ---------------------------------------------------------------------------

function envNumber(key) {
  const v = process.env[key];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function envBool(key) {
  const v = process.env[key];
  if (v === undefined || v === '') return undefined;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function resolveBytes(envBytesKey, envGbKey, fileGbVal, defaultBytes) {
  const bytesOverride = envNumber(envBytesKey);
  if (bytesOverride !== undefined && bytesOverride >= 0) return Math.round(bytesOverride);
  const gbOverride = envNumber(envGbKey);
  if (gbOverride !== undefined && gbOverride >= 0) return Math.round(gbOverride * GB);
  if (fileGbVal !== undefined && fileGbVal !== null) {
    const n = Number(fileGbVal);
    if (Number.isFinite(n) && n >= 0) return Math.round(n * GB);
  }
  return defaultBytes;
}
function loadGcConfig() {
  const fileCfg = readJSON(path.join(ROOT, 'config', 'cas-gc.config.json'), {}) || {};
  const keepEnv = envNumber('CAS_GC_KEEP_SNAPSHOTS');
  const emergencyKeepEnv = envNumber('CAS_GC_EMERGENCY_KEEP_SNAPSHOTS');
  const enabledEnv = envBool('CAS_GC_ENABLED');
  const blockEnv = envBool('CAS_GC_BLOCK_ON_EMERGENCY');
  const keepSnapshots = Math.max(1, Math.round(keepEnv ?? fileCfg.keepSnapshots ?? 20));
  return {
    enabled: enabledEnv ?? (fileCfg.enabled !== false),
    keepSnapshots,
    emergencyKeepSnapshots: Math.max(1, Math.round(emergencyKeepEnv ?? fileCfg.emergencyKeepSnapshots ?? Math.max(1, Math.round(keepSnapshots / 4)))),
    warnBytes: resolveBytes('CAS_GC_WARN_BYTES', 'CAS_GC_WARN_GB', fileCfg.warnGB, 5 * GB),
    autoGcBytes: resolveBytes('CAS_GC_AUTO_BYTES', 'CAS_GC_AUTO_GB', fileCfg.autoGcGB, 10 * GB),
    emergencyBytes: resolveBytes('CAS_GC_EMERGENCY_BYTES', 'CAS_GC_EMERGENCY_GB', fileCfg.emergencyGB, 20 * GB),
    blockOnEmergency: blockEnv ?? (fileCfg.blockOnEmergency !== false)
  };
}
function gb(bytes) { return +(bytes / GB).toFixed(3); }

function casStats() {
  let bytes = 0, objects = 0;
  if (fs.existsSync(CAS_ROOT)) {
    for (const prefix of fs.readdirSync(CAS_ROOT)) {
      const d = path.join(CAS_ROOT, prefix);
      let st; try { st = fs.statSync(d); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const name of fs.readdirSync(d)) {
        try { bytes += fs.statSync(path.join(d, name)).size; objects++; } catch {}
      }
    }
  }
  const snapshotCount = fs.existsSync(SNAP_ROOT) ? fs.readdirSync(SNAP_ROOT).filter(x => x.endsWith('.json')).length : 0;
  return { bytes, objects, snapshotCount };
}

// Reachable-set computation. FAIL-SAFE: a kept snapshot manifest that cannot
// be read or parsed aborts GC entirely instead of silently contributing zero
// references (the original gc() used readJSON(...,{}) here, which would have
// treated a corrupt "kept" manifest as referencing nothing and could delete
// objects that manifest actually needs).
function collectReachableHashes(keep) {
  ensureDir(SNAP_ROOT);
  const manifests = fs.readdirSync(SNAP_ROOT).filter(x => x.endsWith('.json')).sort().reverse();
  const kept = manifests.slice(0, Math.max(1, keep));
  const removeManifests = manifests.slice(Math.max(1, keep));
  const refs = new Set();
  for (const f of kept) {
    const p = path.join(SNAP_ROOT, f);
    let raw;
    try { raw = fs.readFileSync(p, 'utf8'); } catch (e) { throw new Error(`cannot read kept snapshot manifest ${f}: ${e.message}`); }
    let m;
    try { m = JSON.parse(raw); } catch (e) { throw new Error(`corrupt kept snapshot manifest ${f}: ${e.message}`); }
    if (!Array.isArray(m.entries)) throw new Error(`kept snapshot manifest ${f} is missing its entries array`);
    for (const e of m.entries) if (e && e.sha256) refs.add(e.sha256);
  }
  const idx = readJSON(path.join(ROOT, 'CAS_INDEX.json'), null);
  if (idx && Array.isArray(idx.entries)) for (const e of idx.entries) if (e && e.sha256) refs.add(e.sha256);
  return { refs, keptManifests: kept, removeManifests };
}

function dryRunGc(keep) {
  const { refs, keptManifests, removeManifests } = collectReachableHashes(keep);
  let reclaimableBytes = 0, reclaimableObjects = 0;
  const sampleRemoved = [];
  if (fs.existsSync(CAS_ROOT)) {
    for (const prefix of fs.readdirSync(CAS_ROOT)) {
      const d = path.join(CAS_ROOT, prefix);
      let st; try { st = fs.statSync(d); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const name of fs.readdirSync(d)) {
        const h = prefix + name;
        if (!refs.has(h)) {
          let sz = 0; try { sz = fs.statSync(path.join(d, name)).size; } catch {}
          reclaimableObjects++; reclaimableBytes += sz;
          if (sampleRemoved.length < 50) sampleRemoved.push(h);
        }
      }
    }
  }
  return {
    keepSnapshotIds: keptManifests.map(f => f.replace(/\.json$/, '')),
    removeSnapshotIds: removeManifests.map(f => f.replace(/\.json$/, '')),
    referencedObjects: refs.size,
    reclaimableObjects, reclaimableBytes, sampleRemoved
  };
}

function writeRecoveryManifest(report) {
  ensureDir(GC_RECOVERY_DIR);
  const file = path.join(GC_RECOVERY_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeJSON(file, report);
  return file;
}

function writeObservability({ trigger, lastResult, config, stats }) {
  const s = stats || casStats();
  const cfg = config || loadGcConfig();
  const status = {
    schemaVersion: '1.0.0',
    generatedAt: nowIso(),
    currentBytes: s.bytes,
    currentGB: gb(s.bytes),
    objectCount: s.objects,
    snapshotCount: s.snapshotCount,
    limits: { keepSnapshots: cfg.keepSnapshots, emergencyKeepSnapshots: cfg.emergencyKeepSnapshots, warnGB: gb(cfg.warnBytes), autoGcGB: gb(cfg.autoGcBytes), emergencyGB: gb(cfg.emergencyBytes), enabled: cfg.enabled },
    lastGcAt: nowIso(),
    lastGcTrigger: trigger,
    lastGcRan: Boolean(lastResult),
    lastGcOk: lastResult ? Boolean(lastResult.ok) : null,
    lastGcReclaimedBytes: lastResult ? (lastResult.removedBytes || 0) : 0,
    lastGcReclaimedObjects: lastResult ? (lastResult.removedObjects || 0) : 0,
    lastGcRemovedSnapshots: lastResult ? (lastResult.removedSnapshots || 0) : 0
  };
  writeJSON(GC_STATUS_FILE, status);
  return status;
}

// Safe GC: dry-run + report -> recovery manifest -> delete only unreferenced
// objects/old snapshots -> verify the retained latest snapshot -> observability.
// Used by every caller (manual `gc`, watermark-triggered `gcAuto`, and the
// scheduled `integration:cas:gc` npm script) so there is exactly one deletion
// code path in the whole project.
function safeGc({ keep = 20, reason = 'manual' } = {}) {
  let plan;
  try {
    plan = dryRunGc(keep);
  } catch (e) {
    const report = { schemaVersion: '1.0.0', generatedAt: nowIso(), ok: false, aborted: true, reason, error: String(e.message || e) };
    writeJSON(GC_ALARM_FILE, report);
    console.error('[CAS_GC] ABORTED refs/index check failed, nothing deleted:', e.message || e);
    return report;
  }
  const before = casStats();
  const recoveryFile = writeRecoveryManifest({
    schemaVersion: '1.0.0', generatedAt: nowIso(), reason,
    beforeBytes: before.bytes, beforeObjects: before.objects, beforeSnapshots: before.snapshotCount,
    keepSnapshotIds: plan.keepSnapshotIds, removeSnapshotIds: plan.removeSnapshotIds,
    reclaimableBytes: plan.reclaimableBytes, reclaimableObjects: plan.reclaimableObjects,
    referencedObjects: plan.referencedObjects, sampleRemoved: plan.sampleRemoved
  });
  console.log(`[CAS_GC] plan reason=${reason} reclaimable=${plan.reclaimableObjects} objects (~${gb(plan.reclaimableBytes)}GB) removeSnapshots=${plan.removeSnapshotIds.length} recovery=${recoveryFile}`);

  // Recompute the reachable set right before deleting (defends against the
  // snapshot directory changing between plan and execution); this throws
  // (fail-safe abort, nothing deleted) on a corrupt kept manifest.
  let refs;
  try { ({ refs } = collectReachableHashes(keep)); }
  catch (e) {
    const report = { schemaVersion: '1.0.0', generatedAt: nowIso(), ok: false, aborted: true, reason, error: String(e.message || e), recoveryFile };
    writeJSON(GC_ALARM_FILE, report);
    console.error('[CAS_GC] ABORTED refs/index check failed on execute, nothing deleted:', e.message || e);
    return report;
  }
  let removedObjects = 0, removedBytes = 0;
  if (fs.existsSync(CAS_ROOT)) {
    for (const prefix of fs.readdirSync(CAS_ROOT)) {
      const d = path.join(CAS_ROOT, prefix);
      let st; try { st = fs.statSync(d); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const name of fs.readdirSync(d)) {
        const h = prefix + name;
        if (!refs.has(h)) {
          const fp = path.join(d, name);
          let sz = 0; try { sz = fs.statSync(fp).size; } catch {}
          try { fs.unlinkSync(fp); removedObjects++; removedBytes += sz; } catch {}
        }
      }
    }
  }
  const manifests = fs.readdirSync(SNAP_ROOT).filter(x => x.endsWith('.json')).sort().reverse();
  const removeManifests = manifests.slice(Math.max(1, keep));
  for (const f of removeManifests) { try { fs.unlinkSync(path.join(SNAP_ROOT, f)); } catch {} }

  const after = casStats();
  let verifyReport = null, verifyPass = true;
  const latest = latestId();
  if (latest) {
    try { verifyReport = verify(latest); verifyPass = Boolean(verifyReport && verifyReport.pass); }
    catch (e) { verifyPass = false; verifyReport = { pass: false, error: String(e.message || e) }; }
  }
  const result = {
    schemaVersion: '1.0.0', ok: verifyPass, reason,
    keptSnapshots: manifests.length - removeManifests.length, removedSnapshots: removeManifests.length,
    removedObjects, removedBytes, beforeBytes: before.bytes, afterBytes: after.bytes,
    beforeObjects: before.objects, afterObjects: after.objects,
    verifyPass, verifySnapshot: latest || null, recoveryFile
  };
  if (!verifyPass) {
    writeJSON(GC_ALARM_FILE, {
      schemaVersion: '1.0.0', generatedAt: nowIso(), ok: false, reason, verifyReport, recoveryFile,
      guidance: `GC removed unreferenced objects/old snapshots, but post-GC verify of the retained latest snapshot (${latest}) FAILED. Do not run GC again until this is understood. Inspect ${recoveryFile} and DISASTER_RECOVERY_VERIFY_REPORT.json, then restore with: node scripts/cas-merkle-store.cjs restore ${latest} --apply`
    });
    console.error(`[CAS_GC] FAIL post-gc verify failed for snapshot=${latest}; wrote ${GC_ALARM_FILE}`);
  } else {
    try { fs.unlinkSync(GC_ALARM_FILE); } catch {}
    console.log(`[CAS_GC] OK reason=${reason} removedObjects=${removedObjects} removedSnapshots=${removeManifests.length} reclaimed=${gb(removedBytes)}GB kept=${manifests.length - removeManifests.length}`);
  }
  writeObservability({ trigger: reason, lastResult: result, stats: after });
  return result;
}

function decideWatermarkAction(bytes, cfg) {
  if (!cfg.enabled) return 'disabled';
  if (bytes >= cfg.emergencyBytes) return 'emergency';
  if (bytes >= cfg.autoGcBytes) return 'auto';
  if (bytes >= cfg.warnBytes) return 'warn';
  return 'none';
}

// The single entry point both triggers described in the task funnel through:
//  - called automatically at the end of every snapshot() (post-snapshot trigger)
//  - called on a timer via the existing autopilot (npm run integration:cas:gc,
//    wired into data/blocker-repair-policy.json gates.npmScripts - by-schedule trigger)
function gcAuto({ trigger = 'schedule' } = {}) {
  const cfg = loadGcConfig();
  const stats = casStats();
  const action = decideWatermarkAction(stats.bytes, cfg);
  if (action === 'none' || action === 'disabled') {
    writeObservability({ trigger, lastResult: null, config: cfg, stats });
    console.log(`[CAS_GC_AUTO] trigger=${trigger} action=${action} sizeGB=${gb(stats.bytes)}`);
    return { ok: true, action, stats };
  }
  if (action === 'warn') {
    console.warn(`[CAS_GC_AUTO] WARNING CAS size ${gb(stats.bytes)}GB exceeds warn threshold ${gb(cfg.warnBytes)}GB (auto-gc triggers at ${gb(cfg.autoGcBytes)}GB)`);
    writeObservability({ trigger, lastResult: null, config: cfg, stats });
    return { ok: true, action, stats };
  }
  if (action === 'auto') {
    const result = safeGc({ keep: cfg.keepSnapshots, reason: `auto-gc-watermark-${gb(stats.bytes)}GB` });
    return { ok: result.ok, action, stats, result };
  }
  // emergency
  const result = safeGc({ keep: cfg.emergencyKeepSnapshots, reason: `emergency-gc-watermark-${gb(stats.bytes)}GB` });
  const after = casStats();
  if (cfg.blockOnEmergency && after.bytes >= cfg.emergencyBytes) {
    writeJSON(EMERGENCY_BLOCK_FILE, {
      schemaVersion: '1.0.0', generatedAt: nowIso(), ok: false, blocked: true,
      reason: 'emergency-threshold-still-exceeded-after-gc',
      beforeBytes: stats.bytes, afterBytes: after.bytes, emergencyBytes: cfg.emergencyBytes,
      guidance: 'CAS is still over the emergency limit even after emergency GC (the retained/reachable data itself is that large). New snapshots and index builds are blocked until this is resolved: raise CAS_GC_EMERGENCY_GB / config/cas-gc.config.json, lower CAS_GC_KEEP_SNAPSHOTS, or reduce what is tracked as project files.'
    });
    console.error(`[CAS_GC_AUTO] EMERGENCY size still ${gb(after.bytes)}GB after GC >= limit ${gb(cfg.emergencyBytes)}GB; blocking further CAS growth (${EMERGENCY_BLOCK_FILE})`);
  } else {
    try { fs.unlinkSync(EMERGENCY_BLOCK_FILE); } catch {}
  }
  return { ok: result.ok, action, stats, result };
}

// Cheap guard called at the top of buildIndex({store:true}): the expensive
// full CAS walk only happens when the emergency block flag is actually
// present, so this costs nothing on the hot path in normal operation.
function enforceCapacityBeforeStore() {
  if (!fs.existsSync(EMERGENCY_BLOCK_FILE)) return;
  const cfg = loadGcConfig();
  if (!cfg.blockOnEmergency) { try { fs.unlinkSync(EMERGENCY_BLOCK_FILE); } catch {} return; }
  const stats = casStats();
  if (stats.bytes < cfg.emergencyBytes) { try { fs.unlinkSync(EMERGENCY_BLOCK_FILE); } catch {} return; }
  throw new Error(`CAS emergency block active: size ${gb(stats.bytes)}GB >= emergency limit ${gb(cfg.emergencyBytes)}GB. Run "node scripts/cas-merkle-store.cjs gc-auto" or raise CAS_GC_EMERGENCY_GB before creating new snapshots/index entries.`);
}

function buildIndex({ store = true } = {}) {
  if (store) enforceCapacityBeforeStore();
  const files = projectFiles();
  const known = new Set(files);
  const entries = [];
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const st = fs.statSync(abs);
    const hash = shaFile(abs);
    if (store) storeObject(abs, hash);
    const ext = path.extname(rel).toLowerCase();
    let deps = [];
    if (st.size <= 4 * 1024 * 1024 && ['.js','.cjs','.mjs','.jsx','.ts','.tsx','.css','.html','.htm','.py','.json'].includes(ext)) {
      let text = ''; try { text = fs.readFileSync(abs, 'utf8'); } catch {}
      deps = extractSpecs(rel, text).map(spec => resolveRelative(rel, spec, known)).filter(Boolean);
    }
    entries.push({ path: rel, bytes: st.size, sha256: hash, cas: `cas+sha256:${hash}`, dependencies: [...new Set(deps)].sort() });
  }
  const reverse = {};
  for (const e of entries) for (const d of e.dependencies) (reverse[d] ||= []).push(e.path);
  for (const k of Object.keys(reverse)) reverse[k].sort();
  const root = merkleRoot(entries);
  const out = { schemaVersion: '2.0.0', generatedAt: nowIso(), algorithm: 'sha256-merkle-v1', root, files: entries.length, bytes: entries.reduce((n,e)=>n+e.bytes,0), entries };
  const graph = { schemaVersion: '2.0.0', generatedAt: out.generatedAt, merkleRoot: root, nodes: entries.map(e => ({ path: e.path, sha256: e.sha256, dependencies: e.dependencies })), reverseDependencies: reverse };
  writeJSON(path.join(ROOT, 'CAS_INDEX.json'), out);
  writeJSON(path.join(ROOT, 'DEPENDENCY_GRAPH.json'), graph);
  return { out, graph };
}
function snapshot(label = 'manual') {
  const { out } = buildIndex({ store: true });
  const id = `${new Date().toISOString().replace(/[:.]/g,'-')}-${safeLabel(label)}-${out.root.slice(0,12)}`;
  const manifest = { schemaVersion: '2.0.0', id, createdAt: nowIso(), label, merkleRoot: out.root, algorithm: out.algorithm, entries: out.entries.map(({path,bytes,sha256,cas})=>({path,bytes,sha256,cas})) };
  const mf = path.join(SNAP_ROOT, `${id}.json`);
  writeJSON(mf, manifest);
  fs.writeFileSync(path.join(SNAP_ROOT, 'LATEST'), `${id}\n`);
  writeJSON(path.join(ROOT, 'DISASTER_RECOVERY_STATUS.json'), { schemaVersion:'2.0.0', generatedAt:nowIso(), status:'SNAPSHOT_CREATED', latestSnapshot:id, merkleRoot:out.root, files:manifest.entries.length, casDeduplicated:true });
  console.log(`[CAS_SNAPSHOT] ${id} files=${manifest.entries.length} root=${out.root}`);
  // Every snapshot is exactly the moment CAS can grow, so this is where the
  // automatic, config-driven GC watermark check runs (requirement: GC after
  // every snapshot). A GC hiccup must never fail an already-successful
  // snapshot, so this is best-effort from snapshot()'s point of view - a
  // failed/aborted GC still shows up in CAS_GC_STATUS.json / CAS_GC_ALARM.json.
  try { gcAuto({ trigger: 'post-snapshot' }); } catch (e) { console.error('[CAS_GC_AUTO] post-snapshot check failed:', e.message || e); }
  return manifest;
}
function latestId() { try { return fs.readFileSync(path.join(SNAP_ROOT,'LATEST'),'utf8').trim(); } catch { return ''; } }
function loadSnapshot(id = latestId()) { if (!id) throw new Error('no snapshot available'); const p=path.join(SNAP_ROOT,`${id}.json`); const m=readJSON(p); if(!m) throw new Error(`snapshot not found: ${id}`); return m; }
function verify(id) {
  const m = loadSnapshot(id);
  const bad = [];
  for (const e of m.entries) {
    const obj = objectPath(e.sha256);
    if (!fs.existsSync(obj)) bad.push({path:e.path, reason:'missing-cas-object'});
    else if (shaFile(obj) !== e.sha256) bad.push({path:e.path, reason:'cas-hash-mismatch'});
  }
  const computed = merkleRoot(m.entries);
  if (computed !== m.merkleRoot) bad.push({path:'<manifest>', reason:'merkle-root-mismatch', expected:m.merkleRoot, actual:computed});
  const report = { schemaVersion:'2.0.0', generatedAt:nowIso(), snapshot:m.id, merkleRoot:m.merkleRoot, verifiedObjects:m.entries.length-bad.length, totalObjects:m.entries.length, pass:bad.length===0, failures:bad };
  writeJSON(path.join(ROOT,'DISASTER_RECOVERY_VERIFY_REPORT.json'),report);
  console.log(`[DR_VERIFY] ${report.pass?'PASS':'FAIL'} ${report.verifiedObjects}/${report.totalObjects} snapshot=${m.id}`);
  if (!report.pass) process.exitCode = 2;
  return report;
}
function restore(id, apply = false, exact = false) {
  const m = loadSnapshot(id);
  const current = buildIndex({store:true}).out;
  const currentMap = new Map(current.entries.map(e=>[e.path,e.sha256]));
  const changed = m.entries.filter(e=>currentMap.get(e.path)!==e.sha256).map(e=>e.path);
  const extra = [...currentMap.keys()].filter(p=>!m.entries.some(e=>e.path===p));
  if (!apply) { console.log(JSON.stringify({dryRun:true,snapshot:m.id,changed:changed.length,extra:extra.length,changedPaths:changed.slice(0,100),extraPaths:extra.slice(0,100)},null,2)); return; }
  snapshot(`pre-restore-${m.id}`);
  for (const e of m.entries) {
    const src=objectPath(e.sha256), dst=path.join(ROOT,e.path); ensureDir(path.dirname(dst)); fs.copyFileSync(src,dst);
  }
  if (exact) for (const rel of extra) { const abs=path.join(ROOT,rel); try{fs.unlinkSync(abs)}catch{} }
  const after=buildIndex({store:true}).out;
  const pass=after.root===m.merkleRoot || !exact;
  writeJSON(path.join(ROOT,'DISASTER_RECOVERY_RESTORE_REPORT.json'),{schemaVersion:'2.0.0',generatedAt:nowIso(),snapshot:m.id,apply:true,exact,restored:changed.length,extraPreserved:exact?0:extra.length,postMerkleRoot:after.root,targetMerkleRoot:m.merkleRoot,pass});
  console.log(`[DR_RESTORE] restored=${changed.length} exact=${exact} target=${m.id}`);
}
function impact(rel) {
  const graph = readJSON(path.join(ROOT,'DEPENDENCY_GRAPH.json')) || buildIndex({store:false}).graph;
  rel=norm(rel); const seen=new Set([rel]), q=[rel];
  while(q.length){const cur=q.shift(); for(const x of graph.reverseDependencies[cur]||[]) if(!seen.has(x)){seen.add(x);q.push(x)}}
  const out={schemaVersion:'2.0.0',generatedAt:nowIso(),source:rel,affected:[...seen].sort(),count:seen.size};
  writeJSON(path.join(ROOT,'DEPENDENCY_IMPACT_REPORT.json'),out); console.log(JSON.stringify(out,null,2));
}
// Manual/explicit GC entry point. Now routed through the same safeGc() used
// by the automatic triggers, so `npm run integration:cas:gc:manual` gets the
// exact same dry-run/report, refs/index check, recovery manifest and
// post-GC verify as the automatic paths - one implementation, not a parallel one.
function gc(keep = 20) {
  const r = safeGc({ keep: Number(keep) || 20, reason: 'manual' });
  console.log(JSON.stringify({ ok: r.ok, keptSnapshots: r.keptSnapshots, removedSnapshots: r.removedSnapshots, removedObjects: r.removedObjects, removedBytes: r.removedBytes, verifyPass: r.verifyPass, recoveryFile: r.recoveryFile }, null, 2));
  return r;
}

if (require.main === module) {
  const [cmd='index', arg, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'index') { const {out}=buildIndex({store:true}); console.log(`[CAS_INDEX] files=${out.files} root=${out.root}`); }
    else if (cmd === 'snapshot') snapshot(arg || 'manual');
    else if (cmd === 'verify') verify(arg);
    else if (cmd === 'restore') restore(arg, rest.includes('--apply'), rest.includes('--exact'));
    else if (cmd === 'impact') impact(arg || 'package.json');
    else if (cmd === 'gc') { const r = gc(arg === undefined ? loadGcConfig().keepSnapshots : Number(arg)); if (!r.ok) process.exitCode = 2; }
    else if (cmd === 'gc-auto') { const r = gcAuto({ trigger: arg || 'schedule' }); console.log(JSON.stringify(r, null, 2)); if (!r.ok) process.exitCode = 2; }
    else if (cmd === 'stats') { const s = casStats(); const cfg = loadGcConfig(); writeObservability({ trigger: 'manual-stats', lastResult: null, config: cfg, stats: s }); console.log(JSON.stringify({ ...s, gbUsed: gb(s.bytes), limits: cfg }, null, 2)); }
    else { console.error('usage: cas-merkle-store.cjs index | snapshot [label] | verify [id] | restore <id> [--apply] [--exact] | impact <path> | gc [keep] | gc-auto [trigger] | stats'); process.exit(2); }
  } catch (e) { console.error('[CAS_MERKLE] FAIL', e.stack || e.message); process.exit(2); }
}

module.exports = {
  buildIndex, snapshot, verify, restore, impact, gc, gcAuto, safeGc, casStats,
  loadGcConfig, collectReachableHashes, dryRunGc, decideWatermarkAction,
  latestId, loadSnapshot, objectPath, CAS_ROOT, SNAP_ROOT
};
