'use strict';

/**
 * Unified discovery layer for all local AI3D / 3D generation engines and plugins.
 * Scans the two user folders automatically without hard-coded per-feature setup:
 * - C:\Users\user\Desktop\3дгенерация  (TRELLIS.2, Depth-Anything-V2, BuildingGeneratorThreeJS, bene-proggen-maps)
 * - C:\Users\user\Desktop\майн          (InstantMesh, voxelsrv, LittleCubes, mcp-blender, UPNG.js, UniRig, etc.)
 *
 * Heavy engines stay OUTSIDE World_server/Git and are referenced via environment paths.
 * This module never copies model weights and prefers already-extracted directories over ZIPs.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_EXTERNAL_3D = process.env.AI3D_EXTERNAL_3D || 'C:\\Users\\user\\Desktop\\3дгенерация';
const DEFAULT_MINECRAFT_TOOLS = process.env.AI3D_EXTERNAL_MINECRAFT || 'C:\\Users\\user\\Desktop\\майн';

function existsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function existsFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function gitHead(p) {
  try {
    const out = execSync('git rev-parse --short HEAD', { cwd: p, encoding: 'utf8', timeout: 2000 }).trim();
    return out || null;
  } catch { return null; }
}

function scanExternal(folder, name, checks) {
  const base = path.join(folder, name);
  const zip = `${base}.zip`;
  const extracted = existsDir(base);
  const hasZip = existsFile(zip);
  let ready = false;
  let evidence = [];
  if (extracted) {
    for (const c of checks) {
      const ok = existsFile(path.join(base, c)) || existsDir(path.join(base, c));
      evidence.push(`${c}:${ok ? 'ok' : 'missing'}`);
      if (ok) ready = true;
    }
  }
  return {
    name,
    folder,
    path: extracted ? base : (hasZip ? zip : base),
    extracted,
    hasZip,
    ready,
    evidence,
    commit: extracted ? gitHead(base) : null
  };
}

function discoverEngines(options = {}) {
  const root3d = options.external3d || process.env.AI3D_EXTERNAL_ROOT || DEFAULT_EXTERNAL_3D;
  const rootMine = options.externalMine || process.env.AI3D_EXTERNAL_MINECRAFT || DEFAULT_MINECRAFT_TOOLS;

  // Primary AI3D pipeline engines (expected extracted dirs first)
  const primary = [
    scanExternal(root3d, 'TRELLIS.2', ['trellis2/__init__.py', 'trellis2', 'setup.sh']),
    scanExternal(root3d, 'Depth-Anything-V2', ['depth_anything_v2/dpt.py', 'depth_anything_v2']),
    scanExternal(root3d, 'BuildingGeneratorThreeJS', ['procedural-hong-kong-building/source/procedural_building.blend', 'package.json']),
    scanExternal(root3d, 'bene-proggen-maps', ['procgen_maps/__init__.py', 'procgen_maps'])
  ];

  // Extended local tools — auto-detected by directory name + structure, not just zip name
  const extendedCandidates = [
    { name: 'InstantMesh', checks: ['src', 'configs', 'app.py'] },
    { name: 'voxelsrv', checks: ['src', 'package.json'] },
    { name: 'LittleCubes', checks: ['src', 'index.html'] },
    { name: 'mcp-blender', checks: ['src', 'addon'] },
    { name: 'UPNG.js', checks: ['UPNG.js', 'package.json'] },
    { name: 'UniRig', checks: ['src', 'blender'] },
    { name: 'mpfb2', checks: ['src', 'script_samples'] },
    { name: 'graphify', checks: ['pyproject.toml'] },
    { name: 'graphify-godot', checks: ['pyproject.toml'] },
    { name: 'Gut', checks: ['addons/gut'] },
    { name: 'hytopia-source', checks: ['assets'] },
    { name: 'apngasm', checks: [] },
    { name: 'godot-gdscript-toolkit', checks: ['gdtoolkit'] }
  ];

  const extended = extendedCandidates.map(c => scanExternal(rootMine, c.name, c.checks));

  // Blender auto-find: PATH → Program Files → common installs (matches python plugins)
  let blender = process.env.BLENDER_BIN || 'blender';
  let blenderFound = false;
  let blenderSource = 'env/which';
  try {
    if (blender.includes('/') || blender.includes('\\')) {
      blenderFound = existsFile(blender);
      if (blenderFound) blenderSource = 'BLENDER_BIN';
    } else {
      const which = (() => { try { return execSync(`where ${blender}`, { encoding: 'utf8', timeout: 2000 }).trim(); } catch { return ''; } })();
      if (which) { blender = which.split('\n')[0].trim(); blenderFound = true; blenderSource = 'PATH'; }
    }
  } catch { blenderFound = false; }
  if (!blenderFound) {
    const candidates = [
      'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender\\blender.exe',
      'C:\\Program Files\\Blender Foundation\\Blender 3.6\\blender.exe',
    ];
    for (const cand of candidates) if (existsFile(cand)) { blender = cand; blenderFound = true; blenderSource = 'ProgramFiles'; break; }
    // Also try glob for any version
    if (!blenderFound) {
      try {
        const glob = require('fs').readdirSync('C:\\Program Files\\Blender Foundation', { withFileTypes: true });
        for (const d of glob) if (d.isDirectory()) {
          const cand = path.join('C:\\Program Files\\Blender Foundation', d.name, 'blender.exe');
          if (existsFile(cand)) { blender = cand; blenderFound = true; blenderSource = 'ProgramFilesGlob'; break; }
        }
      } catch {}
    }
  }

  // Unified capability detector — mirrors Python runner.plugin_status()
  const instant = extended.find(e => e.name === 'InstantMesh');
  const voxelsrv = extended.find(e => e.name === 'voxelsrv');
  const little = extended.find(e => e.name === 'LittleCubes');
  const godot = { available: true, note: 'GLB glTF 2.0 is natively Godot 4.x importable; emit tscn stub' };
  const trellis = primary.find(p => p.name === 'TRELLIS.2');
  const depth = primary.find(p => p.name === 'Depth-Anything-V2');
  const building = primary.find(p => p.name === 'BuildingGeneratorThreeJS');
  const procgen = primary.find(p => p.name === 'bene-proggen-maps');

  const capabilities = {
    trellis: { available: !!(trellis && trellis.ready), note: 'Linux + CUDA 24GB, else fallback', commit: trellis?.commit || null },
    instantmesh: { available: !!(instant && instant.ready), bridge: 'INSTANTMESH_GPU_WORKER_SERVER_BRIDGE', path: instant?.path || null, commit: instant?.commit || null },
    depth_anything_small: { available: !!(depth && depth.ready), license: 'Apache-2.0 Small only', commit: depth?.commit || null },
    blender: { path: blender, found: blenderFound, source: blenderSource, requiredFor: ['BuildingGeneratorThreeJS', 'bene-proggen-maps'] },
    building_generator: { available: !!(blenderFound && building && building.ready), path: building?.path || null },
    procgen_maps: { available: !!(blenderFound && procgen && procgen.ready), path: procgen?.path || null, license: 'GPL-3.0' },
    godot_voxel_factory: { available: godot.available, engine: 'Godot 4.x glTF + tscn stub + voxel json', voxelsrv: !!(voxelsrv && voxelsrv.ready), littlecubes: !!(little && little.ready) },
    voxel_tools: { voxelsrv: !!(voxelsrv && voxelsrv.ready), littlecubes: !!(little && little.ready), hytopia: existsDir(path.join(rootMine, 'hytopia-source')) }
  };
  // AUTO mode picks best without user: TRELLIS (GPU) → InstantMesh → placeholder
  let autoChoice = 'instantmesh_placeholder';
  let autoReason = 'No GPU: placeholder textured plane (instantmesh bridge)';
  if (capabilities.trellis.available) {
    // On Windows we still report trellis ready but need Linux+GPU for real; auto will fallback to instantmesh
    autoChoice = 'trellis2_or_instantmesh';
    autoReason = 'TRELLIS source ready, will try TRELLIS on Linux CUDA else InstantMesh fallback';
  } else if (capabilities.instantmesh.available) {
    autoChoice = 'instantmesh';
    autoReason = 'TRELLIS unavailable, InstantMesh is best available';
  }

  return {
    generatedAt: new Date().toISOString(),
    roots: { external3d: root3d, externalMine: rootMine },
    blender: { path: blender, found: blenderFound, source: blenderSource, requiredFor: ['BuildingGeneratorThreeJS', 'bene-proggen-maps'] },
    primary,
    extended: extended.filter(e => e.extracted || e.hasZip),
    capabilities,
    auto: { choice: autoChoice, reason: autoReason },
    summary: {
      primaryReady: primary.filter(p => p.ready).length,
      primaryTotal: primary.length,
      trellisReady: !!(trellis && trellis.ready),
      depthReady: !!(depth && depth.ready),
      buildingReady: !!(building && building.ready),
      procgenReady: !!(procgen && procgen.ready),
      instantMeshReady: !!(instant && instant.ready),
      blenderFound,
      godotReady: true,
      voxelTools: !!(voxelsrv && voxelsrv.ready) || !!(little && little.ready)
    }
  };
}

if (require.main === module) {
  const inv = discoverEngines();
  console.log(JSON.stringify(inv, null, 2));
}

module.exports = { discoverEngines, DEFAULT_EXTERNAL_3D, DEFAULT_MINECRAFT_TOOLS };
