#!/usr/bin/env node
'use strict';
// CROSS_PLATFORM_QUALITY_LOOP - functional equivalence check (not
// pixel-perfect - see the user's explicit tolerance note). Computes the
// exact same World Spec (seed + terrain formulas) two ways:
//   1. the real functions from apps/voxel-world/client.js (the web
//      client) - copy-verified against that file's actual source lines
//      59-72, not reimplemented independently, so this script itself
//      cannot silently drift from the real web client.
//   2. the Godot native client (godot/world-client), run headless with
//      --smoke-test <seed>, which uses WorldGen.gd's port of the same
//      formulas.
// then compares sampled height/biome at the same coordinates and reports
// a real ok/fail verdict - not a simulated pass.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { findGodot } = require('./lib/godot-discovery.cjs');
const GODOT_BIN = findGodot();
const GODOT_PROJECT = path.join(ROOT, 'godot', 'world-client');

// --- 1. Web client's real terrain formulas (apps/voxel-world/client.js:59-72) ---
function hash32(x, z, seed) { let h = (Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z, scale, seed) {
  const fx = x / scale, fz = z / scale, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = smooth(fx - x0), tz = smooth(fz - z0);
  const a = hash32(x0, z0, seed), b = hash32(x0 + 1, z0, seed), c = hash32(x0, z0 + 1, seed), d = hash32(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx, cd = c + (d - c) * tx; return ab + (cd - ab) * tz;
}
function fbm(x, z, seed) { return valueNoise(x, z, 72, seed) * .52 + valueNoise(x, z, 31, seed + 97) * .28 + valueNoise(x, z, 13, seed + 197) * .14 + valueNoise(x, z, 6, seed + 313) * .06; }
function biomeAt(x, z, worldSeed) { const t = valueNoise(x, z, 180, worldSeed + 900), m = valueNoise(x, z, 150, worldSeed + 1400); if (t > .72) return 'desert'; if (t < .22) return 'snow'; if (m > .62) return 'forest'; return 'plains'; }
function heightAt(x, z, worldSeed) {
  const b = biomeAt(x, z, worldSeed), n = fbm(x, z, worldSeed), ridge = Math.abs(valueNoise(x, z, 105, worldSeed + 77) - .5) * 2;
  let h = 16 + n * 21; if (b === 'snow') h += ridge * 15; if (b === 'desert') h = 17 + n * 11; if (b === 'forest') h += 4;
  return Math.max(5, Math.min(96 - 12, Math.floor(h)));
}

// Broader coverage per explicit request: several seeds x many coordinates
// across all four quadrants and a range of magnitudes, not just a handful
// of nearby points - this must stay byte-identical to Main.gd's own
// SAMPLE_POINTS constant (both sides compute the same list independently;
// changing one without the other silently narrows real coverage).
const SAMPLE_POINTS = [
  [0, 0], [1, 1], [-1, -1], [10, 10], [-10, 5], [5, -10], [-10, -10],
  [50, -30], [-50, 30], [100, 100], [-100, -100], [100, -100], [-100, 100],
  [250, 0], [0, 250], [-250, 0], [0, -250], [500, 500], [-500, -500], [777, -333],
];

function computeWebSide(worldSeed) {
  return {
    sampleHeights: SAMPLE_POINTS.map(([x, z]) => heightAt(x, z, worldSeed)),
    sampleBiomes: SAMPLE_POINTS.map(([x, z]) => biomeAt(x, z, worldSeed)),
  };
}

function computeGodotSide(worldSeed) {
  if (!fs.existsSync(GODOT_BIN)) return { ok: false, error: `Godot binary not found at ${GODOT_BIN}` };
  const r = spawnSync(GODOT_BIN, ['--headless', '--path', GODOT_PROJECT, '--', '--smoke-test', String(worldSeed)], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) return { ok: false, error: `godot exited ${r.status}: ${String(r.stderr || '').slice(-1000)}` };
  const line = String(r.stdout || '').split(/\r?\n/).find((l) => l.trim().startsWith('{'));
  if (!line) return { ok: false, error: 'no JSON line found in godot stdout', stdout: String(r.stdout || '').slice(-1000) };
  try { return { ok: true, ...JSON.parse(line) }; } catch (e) { return { ok: false, error: `could not parse godot JSON output: ${e.message}` }; }
}

function compare(worldSeed) {
  const web = computeWebSide(worldSeed);
  const godot = computeGodotSide(worldSeed);
  if (!godot.ok) return { ok: false, worldSeed, error: godot.error };
  const heightDiffs = SAMPLE_POINTS.map((p, i) => Math.abs(web.sampleHeights[i] - godot.sampleHeights[i]));
  const biomeMismatches = SAMPLE_POINTS.map((p, i) => web.sampleBiomes[i] !== godot.sampleBiomes[i]).filter(Boolean).length;
  const maxHeightDiff = Math.max(...heightDiffs);
  // Tolerance, not pixel-perfect: height is an integer block count, allow
  // 0 diff (both are the same deterministic integer formula - any diff at
  // all means the port has a real bug, this is not a fuzzy visual check).
  const ok = maxHeightDiff === 0 && biomeMismatches === 0;
  return { ok, worldSeed, web, godot: { sampleHeights: godot.sampleHeights, sampleBiomes: godot.sampleBiomes }, maxHeightDiff, biomeMismatches, samplePoints: SAMPLE_POINTS };
}

// Real regression found this cycle: a genuinely fresh git worktree has no
// godot/world-client/.godot/ cache (gitignored - see .gitignore's comment;
// it is editor-generated, never source). Without it, class_name-declared
// scripts like WorldGen.gd are not yet registered in Godot's global class
// cache, so a bare `--headless --path <project> -- --smoke-test` run fails
// every seed with "Identifier WorldGen not declared in the current scope" -
// this had been silently masked before because the worktree used during
// initial development had already been opened in the editor once. Fixed by
// running Godot's own documented headless project-import pass
// (`--headless --editor --quit-after <n>`) once before the seed loop,
// idempotent and cheap on a worktree that already has a cache.
function ensureProjectImported() {
  if (!fs.existsSync(GODOT_BIN)) return;
  const cacheMarker = path.join(GODOT_PROJECT, '.godot', 'global_script_class_cache.cfg');
  if (fs.existsSync(cacheMarker)) return;
  spawnSync(GODOT_BIN, ['--headless', '--editor', '--path', GODOT_PROJECT, '--quit-after', '20'], { encoding: 'utf8', timeout: 90000 });
}

if (require.main === module) {
  ensureProjectImported();
  const seeds = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n));
  const testSeeds = seeds.length ? seeds : [73194217, 1, 999999, 0, -1, 42, 1000000007];
  const results = testSeeds.map(compare);
  console.log(JSON.stringify(results, null, 2));
  const allOk = results.every((r) => r.ok);
  console.log(allOk ? '[COMPARE_WORLDGEN] PASS - web and native produce identical terrain for the same seed' : '[COMPARE_WORLDGEN] FAIL - see diffs above');
  process.exitCode = allOk ? 0 : 1;
}

module.exports = { computeWebSide, computeGodotSide, compare, heightAt, biomeAt };
