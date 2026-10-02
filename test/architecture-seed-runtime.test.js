'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createArchitectureDNA } = require('../lib/architecture-seeds');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared', 'architecture-seed-runtime.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'architecture-seed-runtime.js' });
const runtime = context.window.ArchitectureSeedRuntime;
const BLOCK = Object.freeze({ AIR:0, GRASS:1, DIRT:2, STONE:3, SAND:4, WOOD:5, LEAVES:6, SNOW:7, WATER:8, GLASS:9, BRICK:10, PLANK:11, COAL:12, IRON:13 });

test('browser architecture runtime is inert for legacy worlds', () => {
  assert.equal(runtime.sample(null, 0, 0), null);
  assert.equal(runtime.column({}, 0, 0, 20, BLOCK), null);
});

test('same architecture seed produces the same voxel column', () => {
  const dna = createArchitectureDNA({ seed: '-3361685360695458093', idea: 'готический затопленный город' });
  const a = runtime.column(dna, 25, 25, 24, BLOCK);
  const b = runtime.column(dna, 25, 25, 24, BLOCK);
  assert.deepEqual(a, b);
});

test('architecture families compile into visibly different voxel massing contracts', () => {
  const ideas = ['gothic city', 'New York', 'древняя китайская архитектура', 'Tokyo', 'future city'];
  const families = ideas.map(idea => {
    const dna = createArchitectureDNA({ seed: '8128', idea });
    const cfg = runtime.familyConfig(dna.primaryFamily);
    return [dna.primaryFamily, cfg.lot, cfg.minH, cfg.rangeH, cfg.wall];
  });
  assert.equal(new Set(families.map(row => row[0])).size, 5);
  assert.ok(new Set(families.map(row => JSON.stringify(row.slice(1)))).size >= 4);
});

test('ruins modifier removes some upper architecture while preserving deterministic structure', () => {
  const intact = createArchitectureDNA({ seed: '99127', idea: 'gothic city' });
  const ruined = createArchitectureDNA({ seed: '99127', idea: 'gothic ruined city' });
  let found = false;
  for (let x = 0; x < 80 && !found; x++) for (let z = 0; z < 80 && !found; z++) {
    const a = runtime.column(intact, x, z, 24, BLOCK);
    const b = runtime.column(ruined, x, z, 24, BLOCK);
    if ((a?.blocks?.length || 0) > (b?.blocks?.length || 0) && (b?.blocks?.length || 0) > 0) found = true;
  }
  assert.equal(found, true);
});

test('voxel-world loads and wires the architecture seed runtime', () => {
  const html = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  assert.match(html, /\/shared\/architecture-seed-runtime\.js/);
  assert.match(client, /architectureState=worldSettings\.worldDNA\?\.architecture\|\|worldSettings\.architecture\|\|null/);
  assert.match(client, /architectureColumn\(x,z,h\)/);
  assert.match(client, /applyEmergenceColumn\(c,lx,lz,x,z,h,architecture\)/);
});
