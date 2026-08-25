#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROOT = process.cwd();
const APPLY = process.argv.includes('--apply');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/asset-transcode-policy.json'), 'utf8'));
const derivedMapPath = path.join(ROOT, 'data/derived-asset-map.json');

function rel(f) { return path.relative(ROOT, f).replaceAll('\\', '/'); }
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (e.isFile()) out.push(f);
  }
  return out;
}
function skip(file) {
  const lower = path.basename(file).toLowerCase();
  return (policy.skipNamePatterns || []).some(p => lower.includes(String(p).toLowerCase()));
}
function binary(name) {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const local = path.join(ROOT, 'node_modules', '.bin', `${name}${ext}`);
  return fs.existsSync(local) ? local : name;
}
function commandAvailable(cmd) {
  try {
    const r = cp.spawnSync(cmd, ['--version'], { cwd: ROOT, stdio: 'ignore', shell: false });
    return r.status === 0;
  } catch { return false; }
}
function run(cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], shell: false });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} failed: ${(r.stderr || r.stdout || '').slice(-1600)}`);
  return r;
}
function derivedTexturePath(file) {
  return file.replace(/\.(png|jpe?g)$/i, '.ktx2');
}
function derivedModelPath(file) {
  const ext = path.extname(file);
  return file.slice(0, -ext.length) + `${policy.derivedSuffix || '.optimized'}.glb`;
}
async function encodeTexture(file, out) {
  const { encodeToKTX2 } = await import('ktx2-encoder');
  const name = path.basename(file).toLowerCase();
  const isUASTC = (policy.texture.uastcNamePatterns || []).some(x => name.includes(String(x).toLowerCase()));
  const bytes = new Uint8Array(fs.readFileSync(file));
  const encoded = await encodeToKTX2(bytes, { isUASTC, generateMipmap: policy.texture.generateMipmaps !== false });
  fs.writeFileSync(out, Buffer.from(encoded));
  return { codec: isUASTC ? 'UASTC' : 'ETC1S' };
}
function encodeModel(file, out, gltf) {
  const tmp1 = `${out}.meshopt.tmp.glb`;
  const tmp2 = `${out}.uastc.tmp.glb`;
  try {
    run(gltf, ['meshopt', file, tmp1, '--level', policy.model.meshoptLevel || 'medium']);
    let current = tmp1;
    try {
      run(gltf, ['uastc', current, tmp2, '--slots', '{normalTexture,occlusionTexture,metallicRoughnessTexture}', '--level', String(policy.model.uastcLevel || 4), '--rdo', '--rdo-lambda', '4', '--zstd', '18']);
      current = tmp2;
    } catch {}
    try {
      run(gltf, ['etc1s', current, out, '--slots', '{baseColorTexture,emissiveTexture}', '--quality', String(policy.model.etc1sQuality || 255)]);
    } catch {
      fs.copyFileSync(current, out);
    }
    return { codec: 'MESHOPT+KTX2_WHEN_AVAILABLE' };
  } finally {
    fs.rmSync(tmp1, { force: true });
    fs.rmSync(tmp2, { force: true });
  }
}

async function main() {
  const files = [];
  for (const root of policy.sourceRoots || []) walk(path.join(ROOT, root), files);
  const textureExt = new Set(policy.textureExtensions || []);
  const modelExt = new Set(policy.modelExtensions || []);
  const candidates = files.filter(f => {
    const stat = fs.statSync(f), ext = path.extname(f).toLowerCase();
    if (skip(f) || stat.size > policy.maxSourceBytes) return false;
    if (textureExt.has(ext)) return stat.size >= policy.textureMinBytes;
    if (modelExt.has(ext)) return stat.size >= policy.modelMinBytes && !f.includes(`${policy.derivedSuffix || '.optimized'}.`);
    return false;
  });
  const gltf = binary('gltf-transform');
  const gltfAvailable = commandAvailable(gltf);
  let ktxAvailable = false;
  try { require.resolve('ktx2-encoder', { paths: [ROOT] }); ktxAvailable = true; } catch {}
  const report = { schemaVersion:'4.0.0', mode: APPLY ? 'apply':'plan', tools:{gltfTransform:gltfAvailable,ktx2Encoder:ktxAvailable}, candidates:[], derived:[], failures:[] };
  const map = { schemaVersion:'1.0.0', assets:{} };
  if (fs.existsSync(derivedMapPath)) {
    try { Object.assign(map.assets, JSON.parse(fs.readFileSync(derivedMapPath,'utf8')).assets || {}); } catch {}
  }
  for (const file of candidates) {
    const ext = path.extname(file).toLowerCase(), before = fs.statSync(file).size;
    const item = { source:rel(file), bytes:before, sha256:sha(file), type:textureExt.has(ext)?'texture':'model' };
    report.candidates.push(item);
    if (!APPLY) continue;
    try {
      let out, meta;
      if (item.type === 'texture') {
        if (!ktxAvailable) throw new Error('ktx2-encoder is not installed');
        out = derivedTexturePath(file); meta = await encodeTexture(file, out);
      } else {
        if (!gltfAvailable) throw new Error('@gltf-transform/cli is not installed');
        out = derivedModelPath(file); meta = encodeModel(file, out, gltf);
      }
      const after = fs.statSync(out).size;
      const record = { source:item.source, derived:rel(out), sourceBytes:before, derivedBytes:after, sourceSha256:item.sha256, derivedSha256:sha(out), ...meta };
      report.derived.push(record);
      map.assets['/' + item.source] = '/' + record.derived;
    } catch (error) {
      report.failures.push({ source:item.source, error:String(error?.message || error).slice(0,1800) });
    }
  }
  fs.writeFileSync(path.join(ROOT,'CPU_ASSET_TRANSCODE_REPORT.json'), JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(derivedMapPath, JSON.stringify(map,null,2)+'\n');
  console.log(`[CPU_ASSET_TRANSCODE] mode=${report.mode} candidates=${report.candidates.length} derived=${report.derived.length} failures=${report.failures.length} gltf=${gltfAvailable} ktx2=${ktxAvailable}`);
  if (APPLY && report.failures.length) process.exitCode = 86;
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { walk, skip, derivedTexturePath, derivedModelPath };
