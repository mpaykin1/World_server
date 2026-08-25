#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const {
  ROOT, STATE_DIR, norm, ensureDir, shaBuffer, shaFile, readJSON, writeJSON, projectFiles, nowIso, safeLabel
} = require('./integration-utils.cjs');

const CAS_ROOT = path.join(STATE_DIR, 'cas', 'sha256');
const SNAP_ROOT = path.join(STATE_DIR, 'snapshots');
ensureDir(CAS_ROOT); ensureDir(SNAP_ROOT);

function objectPath(hash) { return path.join(CAS_ROOT, hash.slice(0, 2), hash.slice(2)); }
function storeObject(abs, hash) {
  const dst = objectPath(hash);
  if (!fs.existsSync(dst)) { ensureDir(path.dirname(dst)); fs.copyFileSync(abs, dst); }
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
function buildIndex({ store = true } = {}) {
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
function gc(keep = 20) {
  const manifests = fs.readdirSync(SNAP_ROOT).filter(x=>x.endsWith('.json')).sort().reverse();
  const kept=manifests.slice(0,Math.max(1,keep)); const removeManifests=manifests.slice(Math.max(1,keep));
  const refs=new Set();
  for(const f of kept){const m=readJSON(path.join(SNAP_ROOT,f),{});for(const e of m.entries||[])refs.add(e.sha256)}
  const idx=readJSON(path.join(ROOT,'CAS_INDEX.json'),{});for(const e of idx.entries||[])refs.add(e.sha256);
  let removedObjects=0;
  if(fs.existsSync(CAS_ROOT))for(const prefix of fs.readdirSync(CAS_ROOT)){const d=path.join(CAS_ROOT,prefix);if(!fs.statSync(d).isDirectory())continue;for(const name of fs.readdirSync(d)){const h=prefix+name;if(!refs.has(h)){fs.unlinkSync(path.join(d,name));removedObjects++}}}
  for(const f of removeManifests)fs.unlinkSync(path.join(SNAP_ROOT,f));
  console.log(JSON.stringify({ok:true,keptSnapshots:kept.length,removedSnapshots:removeManifests.length,removedObjects},null,2));
}

const [cmd='index', arg, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'index') { const {out}=buildIndex({store:true}); console.log(`[CAS_INDEX] files=${out.files} root=${out.root}`); }
  else if (cmd === 'snapshot') snapshot(arg || 'manual');
  else if (cmd === 'verify') verify(arg);
  else if (cmd === 'restore') restore(arg, rest.includes('--apply'), rest.includes('--exact'));
  else if (cmd === 'impact') impact(arg || 'package.json');
  else if (cmd === 'gc') gc(Number(arg || 20));
  else { console.error('usage: cas-merkle-store.cjs index | snapshot [label] | verify [id] | restore <id> [--apply] [--exact] | impact <path> | gc [keep]'); process.exit(2); }
} catch (e) { console.error('[CAS_MERKLE] FAIL', e.stack || e.message); process.exit(2); }
