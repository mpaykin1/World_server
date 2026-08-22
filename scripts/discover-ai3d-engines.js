'use strict';

const fs = require('fs');
const path = require('path');
const { discoverEngines } = require('../lib/ai3d-discovery');

const inventory = discoverEngines();

console.log('=== AI3D Engine discovery ===');
console.log(`External 3D: ${inventory.roots.external3d}`);
console.log(`External Mine: ${inventory.roots.externalMine}`);
console.log(`Blender: ${inventory.blender.path} (${inventory.blender.found ? 'found' : 'NOT FOUND'})`);
console.log('');

console.log('Primary pipeline engines:');
for (const e of inventory.primary) {
  console.log(`  ${e.name}: ${e.ready ? 'READY' : 'MISSING'} — ${e.path} ${e.commit ? `(${e.commit})` : ''} [${e.evidence.join(', ')}]${e.hasZip && !e.extracted ? ' (zip only)' : ''}`);
}
console.log('');
console.log('Extended local tools (auto-detected):');
for (const e of inventory.extended) {
  console.log(`  ${e.name}: ${e.ready ? 'ready' : 'found'} — ${e.path}${e.commit ? ` (${e.commit})` : ''}`);
}
console.log('');
console.log('Unified capabilities:');
for (const [k, v] of Object.entries(inventory.capabilities)) {
  console.log(`  ${k}: ${JSON.stringify(v)}`);
}
console.log(`\nAUTO choice: ${inventory.auto.choice} — ${inventory.auto.reason}`);
console.log(`Summary: ${inventory.summary.primaryReady}/${inventory.summary.primaryTotal} primary engines ready, Blender:${inventory.summary.blenderFound ? 'yes' : 'no'}, InstantMesh:${inventory.summary.instantMeshReady ? 'yes' : 'no'}`);

// Write auto-generated inventory for the worker and for CI
const outPath = path.join(__dirname, '..', 'services', 'ai3d-worker', 'third_party', 'local-inventory.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2), 'utf8');
console.log(`\nWritten inventory to ${outPath}`);

// Also write a short markdown for docs
const mdPath = path.join(__dirname, '..', 'docs', 'AI3D_DISCOVERY.md');
const md = `# AI3D Auto-Discovery (${inventory.generatedAt})

Scanned automatically from:
- \`${inventory.roots.external3d}\`
- \`${inventory.roots.externalMine}\`

## Primary pipeline
${inventory.primary.map(e => `- **${e.name}** — ${e.ready ? 'READY' : 'MISSING'} — \`${e.path}\`${e.commit ? ` @ \`${e.commit}\`` : ''}`).join('\n')}

## Blender (auto-found)
- Path: \`${inventory.blender.path}\` — ${inventory.blender.found ? 'found ('+inventory.blender.source+')' : 'NOT FOUND (required for building/map)'} — World_server no longer requires manual BLENDER_BIN

## Unified capabilities
${Object.entries(inventory.capabilities).map(([k,v]) => `- **${k}**: \`${JSON.stringify(v).slice(0,200)}\``).join('\n')}

## AUTO mode
- Choice: \`${inventory.auto.choice}\` — ${inventory.auto.reason}
- Fallback chain: TRELLIS.2 (Linux+CUDA) → InstantMesh (\`майн/InstantMesh\`, INSTANTMESH_GPU_WORKER_SERVER_BRIDGE) → placeholder GLB + diagnostic

## Extended tools detected
${inventory.extended.map(e => `- **${e.name}** — \`${e.path}\`${e.commit ? ` @ ${e.commit}` : ''}`).join('\n')}

## Godot voxel factory
- GLB is always Godot 4.x glTF importable; worker emits \`godot_import.tscn\` + \`godot_voxel.json\` alongside every GLB for auto pipeline. Existing \`apps/voxel-world\` untouched.

## Notes
- Heavy weights/repositories are not copied into Git; the worker references them via environment paths (\`TRELLIS2_HOME\`, \`DEPTH_ANYTHING_HOME\`, \`INSTANTMESH_HOME\`, etc.) and can clone pinned commits on a Linux GPU host.
- TRELLIS.2 is Linux-only and requires NVIDIA CUDA with 24GB+ VRAM per upstream docs — Windows smoke tests will report unavailable and fallback to InstantMesh placeholder.
- Depth Anything V2 Small (Apache-2.0) is the default; Base/Large/Giant are intentionally not enabled.
`;
fs.writeFileSync(mdPath, md, 'utf8');
console.log(`Written discovery doc to ${mdPath}`);
