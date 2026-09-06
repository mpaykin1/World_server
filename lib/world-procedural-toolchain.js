'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function firstExisting(candidates) { return candidates.find((p) => p && fs.existsSync(p)) || null; }

function detectToolchain(rootDir = process.cwd()) {
  const vendor = path.join(rootDir, 'vendor', 'procedural-world-toolchain');
  const exe = process.platform === 'win32' ? '.exe' : '';
  return {
    vendor,
    fastNoiseLite: fs.existsSync(path.join(vendor, 'FastNoiseLite')) ? path.join(vendor, 'FastNoiseLite') : null,
    meshoptimizer: fs.existsSync(path.join(vendor, 'meshoptimizer')) ? path.join(vendor, 'meshoptimizer') : null,
    basisUniversal: fs.existsSync(path.join(vendor, 'basis_universal')) ? path.join(vendor, 'basis_universal') : null,
    ktxSoftware: fs.existsSync(path.join(vendor, 'KTX-Software')) ? path.join(vendor, 'KTX-Software') : null,
    zstd: fs.existsSync(path.join(vendor, 'zstd')) ? path.join(vendor, 'zstd') : null,
    gltfpack: firstExisting([
      path.join(vendor, 'bin', `gltfpack${exe}`),
      path.join(vendor, 'meshoptimizer', 'build', `gltfpack${exe}`),
      path.join(vendor, 'meshoptimizer', 'build', 'Release', `gltfpack${exe}`)
    ]),
    zstdBin: firstExisting([
      path.join(vendor, 'bin', `zstd${exe}`),
      path.join(vendor, 'zstd', 'programs', `zstd${exe}`),
      path.join(vendor, 'zstd', 'build', 'cmake', 'build', 'programs', 'Release', `zstd${exe}`)
    ])
  };
}

function runTool(binary, args, options = {}) {
  if (!binary || !fs.existsSync(binary)) throw new Error(`optional tool binary unavailable: ${binary || 'not configured'}`);
  const result = cp.spawnSync(binary, args, { cwd: options.cwd || process.cwd(), encoding: 'utf8', shell: false, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    const error = new Error(`tool failed (${path.basename(binary)}): ${String(result.stderr || result.stdout).trim()}`);
    error.status = result.status;
    throw error;
  }
  return result;
}

function optimizeGlb(input, output, options = {}) {
  const tools = detectToolchain(options.rootDir);
  const args = ['-i', path.resolve(input), '-o', path.resolve(output), '-cc'];
  if (options.simplifyRatio != null) args.push('-si', String(options.simplifyRatio));
  return runTool(tools.gltfpack, args, { cwd: options.rootDir });
}

function zstdCompress(input, output, options = {}) {
  const tools = detectToolchain(options.rootDir);
  return runTool(tools.zstdBin, ['-q', '-f', `-${Math.max(1, Math.min(19, Math.trunc(Number(options.level) || 6)))}`, path.resolve(input), '-o', path.resolve(output)], { cwd: options.rootDir });
}

module.exports = { detectToolchain, runTool, optimizeGlb, zstdCompress };
