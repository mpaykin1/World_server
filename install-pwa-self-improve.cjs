#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HERE = __dirname;
const PAYLOAD = path.join(HERE, 'payload');
const EXPECTED_BLOBS = {
  'package.json': ['03eff62e70a28d520b073650f93bb6482978ee53', 'c4596bce8f1a04dde1ff075081625eba8e4c14df', 'ef5da58002090c03d853af83b560940d78fe1e5a'],
  'server.js': ['5c0f2a1f3ebfefc58312de986f22cd184ee4c753', 'ab4ba2e8b73e8c63c035d68d7a03dae9adeb2d85'],
  'vercel.json': ['0f08743ce4ad6835b186a4b3c209caa0cf84ee9f', '335fe3143675d032845b63e9a08c1305fcab8a55'],
  'playwright.config.js': ['3cb5b0cdf7ac35cdc1c91eb56afbbf5d71e4a51a', '422cfa8943d65fcdaf0181708a5007cb26fa8f84'],
  'api/quality-summary.js': ['bf5b4fe190a4b060590c889e65d6bd70af655886', '68f3b7a45e821fa832a1fcc66124dab502637fc1'],
  'api/quality-telemetry.js': ['0c2eb3f8b063391dc59184e2188559126f3ce236'],
  'scripts/production-quality-pull.js': ['4e469dcde04f32976a1e8e13acd926efae6d9fe8', '73c133c5a36bc74a11710c426ee99ee367761470'],
  'scripts/ai-visual-critic.js': ['3bed60e28aad3f83ebe5005238995f2983aa5ffe', 'a9d02e29fd36cbd4112e10e462c495295c52711d'],
  'data/performance-budgets.json': ['c38e5e0a742afc37349b6fc2008b8155d5c44bb3', '04e1c74b248132633a70d7b9ff48ebdf56cb81b5'],
  '.github/workflows/quality-canary.yml': ['6dbcf4b43dd1a2b8662e9ca41c712856931b5687', '977205b6e4f2a24d5f24e447927ab83446dab413']
};


const V2_MANAGED_BLOBS = {
  ".github/workflows/pwa-self-improve.yml": "257ff10fe838042a14c1d078ebe29877e52e8920",
  ".github/workflows/quality-canary.yml": "977205b6e4f2a24d5f24e447927ab83446dab413",
  "DESKTOP_AI_PWA_SELF_IMPROVING.md": "0339b61cd43c2868d3b3f37fd055e02f51059ef4",
  "PWA_SELF_IMPROVING_SYSTEM.md": "3bc8cd060b993834310aac7777fe95d86058d611",
  "WORK_IN_PROGRESS.md": "40b5c2837683237115dd2ccf6be615749a798e97",
  "api/pwa-manifest.js": "4643f6e6a9c28b4aa620c0c2e811ea82822d4901",
  "api/quality-summary.js": "68f3b7a45e821fa832a1fcc66124dab502637fc1",
  "data/asset-quality-policy.json": "d3c34938d29f4ecd426609627ab601f0c399d009",
  "data/performance-budgets.json": "04e1c74b248132633a70d7b9ff48ebdf56cb81b5",
  "data/self-improvement-policy.json": "aa336df3c4926ab003c4878cb60bae509a38e7db",
  "data/self-improvement-risk-policy.json": "431b397a2786bfbc735b16ff44c6cf77bceaa4da",
  "e2e/pwa.spec.js": "123f56d8fd168cd05a078ef81582616c17969cc3",
  "offline.html": "57af68458a9a972e6774aba51ab3b09406c6ace5",
  "package.json": "c4596bce8f1a04dde1ff075081625eba8e4c14df",
  "playwright.config.js": "422cfa8943d65fcdaf0181708a5007cb26fa8f84",
  "scripts/ai-visual-critic.js": "a9d02e29fd36cbd4112e10e462c495295c52711d",
  "scripts/apply-verified-quality-patch.js": "77a4973fb99a3a55a353f5528b80e72947b0752b",
  "scripts/asset-quality-pipeline.js": "a8b3b79daeca21cda6d29d3d6d0d93b08bf1127e",
  "scripts/check-animation-quality-system.js": "e5b25780ace93918c27813b3b915f8b936d99727",
  "scripts/check-pwa-system.js": "652e16e3a0731dc120f393347187730359e51b81",
  "scripts/enrich-improvement-plan.js": "a503d8b574790439f12d63d6587b7b92a1c29a97",
  "scripts/inject-pwa-runtime.js": "23b79f5403fbca5ab22b88a6f50dc6bc62375450",
  "scripts/production-quality-pull.js": "73c133c5a36bc74a11710c426ee99ee367761470",
  "scripts/quiet-self-improve.js": "fe5446e9f974acf432d6da9815f27ebaff907856",
  "scripts/runtime-integration-discovery.js": "877db13aaa8a5ce65b28b45606ac8aaaa9981d31",
  "scripts/self-improvement-risk.js": "ffb379a55bbcb9f0aa931b89a0f8cb568f97d376",
  "server.js": "ab4ba2e8b73e8c63c035d68d7a03dae9adeb2d85",
  "shared/animation-quality-validator.js": "fd7430508983448087bdfa0d2642c979276a4674",
  "shared/device-quality-runtime.js": "14ca5e60b252f1157281e7098fa9fc282701b570",
  "shared/graphics-quality-controller.js": "db9d992cebb1f8d493c8a02b9729090b1aebf426",
  "shared/pwa-icon-180.png": "dd8234b37eb9a2062316d5917f843a029bce267a",
  "shared/pwa-icon-192.png": "773ebcd1e7c841fba89d859d05edaa3825955179",
  "shared/pwa-icon-512.png": "4230bc6f41bc8cd81b3c3835d279eb3b74c37370",
  "shared/pwa-runtime.js": "263d288dfbdad1910b99a10ae5af250455dbdf09",
  "sw.js": "bac58c45417c8b279b7120670c8eb29f787f798d",
  "test/animation-quality-validator.test.js": "418644ed024f12f93de75508bfb08753d8b2afd8",
  "test/pwa-system.test.js": "6945356863fe9b1a40d1691b9f57f52c99413956",
  "test/self-improvement-risk.test.js": "973fbbf4411780879162a07ae93308c4f9412327",
  "vercel.json": "335fe3143675d032845b63e9a08c1305fcab8a55"
};

const V3_MANAGED_BLOBS = {
  ".github/workflows/pwa-self-improve.yml": "2723ace9e098bf9142b5275a5c5cc89347a41e5b",
  ".github/workflows/quality-canary.yml": "977205b6e4f2a24d5f24e447927ab83446dab413",
  "DESKTOP_AI_PWA_SELF_IMPROVING.md": "e9473d2659be48639fe0596f50e47897c6ed0585",
  "PWA_SELF_IMPROVING_SYSTEM.md": "37192cfa7c080d4f85ee059bd93d16c2abd5ee41",
  "WORK_IN_PROGRESS.md": "39ea2dafa0c3cb074dcb10b99a33130740ac8515",
  "api/pwa-manifest.js": "4643f6e6a9c28b4aa620c0c2e811ea82822d4901",
  "api/quality-summary.js": "40c84cd1a330cbe60c41e0b6e0bed34f0d2de7c9",
  "data/asset-quality-policy.json": "1114c776129817052158cba053ac45cf27bb62b6",
  "data/performance-budgets.json": "04e1c74b248132633a70d7b9ff48ebdf56cb81b5",
  "data/quality-convergence-policy.json": "551598d045c1cb822e85d740a433b87d072c7656",
  "data/self-improvement-policy.json": "7e81195f5eb645684d283e71ef487c90e2c62829",
  "data/self-improvement-risk-policy.json": "431b397a2786bfbc735b16ff44c6cf77bceaa4da",
  "e2e/pwa.spec.js": "123f56d8fd168cd05a078ef81582616c17969cc3",
  "offline.html": "57af68458a9a972e6774aba51ab3b09406c6ace5",
  "package.json": "a767ca2ad498d7397f48bf8caf03eccda64754dd",
  "playwright.config.js": "422cfa8943d65fcdaf0181708a5007cb26fa8f84",
  "scripts/ai-visual-critic.js": "a9d02e29fd36cbd4112e10e462c495295c52711d",
  "scripts/apply-verified-quality-patch.js": "77a4973fb99a3a55a353f5528b80e72947b0752b",
  "scripts/asset-quality-pipeline.js": "26bb0a04b4ebaa884cb68adb8fdeb315a83ed11b",
  "scripts/check-animation-quality-system.js": "e57860696360ff2cad2c920cfb99d6df1c62b09b",
  "scripts/check-pwa-system.js": "cfa752683211d755179669ef731e1a558d52d81c",
  "scripts/enrich-improvement-plan.js": "a503d8b574790439f12d63d6587b7b92a1c29a97",
  "scripts/inject-pwa-runtime.js": "79c14eae4136dfd0124c484eab918a238f78a948",
  "scripts/integrate-runtime-adapters.js": "43e0918e80ae6743b7b749e0df5e9756c3dca6cb",
  "scripts/production-quality-pull.js": "1d86c127481c3765def89dc362aa72b9985b5788",
  "scripts/quality-convergence-loop.js": "bf1140b927bdf49c817d5ca606edd94cb33b2b2a",
  "scripts/quiet-self-improve.js": "1c2d7756118e73928d2e7c8e0667b7adef5167fe",
  "scripts/runtime-integration-discovery.js": "7a672c06dd162100d7d9e261c42677fd53532fa6",
  "scripts/self-improvement-risk.js": "ffb379a55bbcb9f0aa931b89a0f8cb568f97d376",
  "server.js": "ab4ba2e8b73e8c63c035d68d7a03dae9adeb2d85",
  "shared/animation-quality-validator.js": "0de733a8f95572a27f1da60674c7dc267659a625",
  "shared/asset-delivery-runtime.js": "4b99260d15fce8e5431a94d293b597dc83325e2d",
  "shared/device-quality-runtime.js": "93e3986685f2c607218f4a7074097249d1df6bc7",
  "shared/graphics-quality-controller.js": "ade48464f809bbf807c30837b8eca2d085356c80",
  "shared/pwa-icon-180.png": "dd8234b37eb9a2062316d5917f843a029bce267a",
  "shared/pwa-icon-192.png": "773ebcd1e7c841fba89d859d05edaa3825955179",
  "shared/pwa-icon-512.png": "4230bc6f41bc8cd81b3c3835d279eb3b74c37370",
  "shared/pwa-runtime.js": "66595bb2180aabc9507a8b93095a7bca82eceeb4",
  "sw.js": "8e1cbc388ac0c8be49b38c6f4179ab14b103f110",
  "test/animation-quality-validator.test.js": "b00e8931f2bab6e0cb97d84b712f1e6b8ba2109c",
  "test/pwa-system.test.js": "eafd8c84d7d919c9aa60cab571e2c198be5b150b",
  "test/quality-convergence-policy.test.js": "9894248745375c36b56c177b2a846543f0661a55",
  "test/runtime-integration-adapters.test.js": "ed4f83db4080c00b99904833737d94591f21bc65",
  "test/self-improvement-risk.test.js": "973fbbf4411780879162a07ae93308c4f9412327",
  "vercel.json": "335fe3143675d032845b63e9a08c1305fcab8a55"
};

const AGENT_POLICY_START = '<!-- PWA_QUIET_SELF_IMPROVE_POLICY:START -->';
const AGENT_POLICY_END = '<!-- PWA_QUIET_SELF_IMPROVE_POLICY:END -->';
const AGENT_POLICY_BLOCK = `${AGENT_POLICY_START}

## 12. PWA quiet self-improvement — narrow autonomous merge exception

The repository owner explicitly authorizes autonomous merge only for the PWA quiet self-improvement lane when ALL of these are true:

- candidate risk is 'low' under 'data/self-improvement-risk-policy.json';
- AI code, when used, was sandbox-verified before application;
- full 'npm run release:gate' passed;
- the exact deployed preview passed Chromium + WebKit Playwright;
- post-deploy smoke passed;
- the change does not touch API, database, CI, dependencies, Vercel config, AGENTS, or the accepted quality baseline;
- a failed production smoke triggers Vercel rollback and a code revert for the autonomous quiet patch;
- npm run quality:converge:full must finish as CLEAN; BLOCKED_UNRESOLVED or MAX_ROUNDS_UNRESOLVED can never be reported as completion.

Medium/high-risk candidates still require normal human review. This is a narrow exception to the general no-auto-merge rule and must never be broadened silently.

## 13. PWA SELF-IMPROVING V4 — convergence, derived assets and real-device truth

- BLOCKED_UNRESOLVED is never completion. Desktop AI must inspect the blocker, repair root cause, add/update regression protection and rerun until QUALITY_CONVERGENCE_REPORT.json.status is CLEAN.
- Runtime performance work must preserve working graphics. Prefer adaptive DPR, LOD, predictive streaming, shader prewarm, batching/cache and source-preserving derived assets. Never delete visual detail merely to make a gate green.
- CPU KTX2/Basis and Meshopt outputs are derivatives only; source PNG/JPG/GLB/GLTF masters remain intact. Any derived asset promoted to runtime use needs load + visual/perceptual evidence.
- WebKit emulation is mandatory but is not proof of a physical iPhone. Real iPhone evidence comes only from production telemetry or a documented physical-device run.
- Learned quality recommendations may lower load for weak devices, but may not silently raise beyond capability safety limits.
- Shader/stutter, predictive-streaming and renderer adapters must be integrated into every certified compatible renderer; discovered relevant character rigs must be registered with semantic animation validation.
- Every autonomous patch still goes through sandbox/release gate, deployed preview, browser gate, smoke, risk classification and rollback policy.

${AGENT_POLICY_END}
`

function run(cmd, args, cwd, options = {}) {
  const output = cp.execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: process.env
  });
  return typeof output === 'string' ? output.trim() : '';
}

function isRepo(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    return pkg.name === 'webgl-survival-hub-no-npm' && fs.existsSync(path.join(dir, '.git'));
  } catch { return false; }
}

function findRepo() {
  const supplied = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const candidates = [
    supplied,
    process.cwd(),
    path.resolve(HERE, '..'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'World_server'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'World_server-main')
  ].filter(Boolean);
  for (const dir of candidates) if (isRepo(dir)) return dir;
  throw new Error('World_server repository not found. Run: node install-pwa-self-improve.cjs "C:\\path\\to\\World_server"');
}

function listFiles(dir, root = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, root, out);
    else if (entry.isFile()) out.push(path.relative(root, full).replaceAll('\\', '/'));
  }
  return out;
}

function headBlob(repo, rel) {
  try { return run('git', ['rev-parse', `HEAD:${rel}`], repo); }
  catch { return null; }
}

function copyFile(repo, rel) {
  const src = path.join(PAYLOAD, ...rel.split('/'));
  const dst = path.join(repo, ...rel.split('/'));
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function sameBytes(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const aa = fs.readFileSync(a), bb = fs.readFileSync(b);
  return aa.equals(bb);
}

function payloadBlob(rel) {
  const src = path.join(PAYLOAD, ...rel.split('/'));
  try { return run('git', ['hash-object', src], HERE); } catch { return null; }
}
function acceptedHead(rel, head) {
  if (!head) return false;
  const accepted = new Set([...(EXPECTED_BLOBS[rel] || []), V2_MANAGED_BLOBS[rel], V3_MANAGED_BLOBS[rel], payloadBlob(rel)].filter(Boolean));
  return accepted.has(head);
}

function ensureAgentPolicy(repo) {
  const file = path.join(repo, 'AGENTS.md');
  let text = fs.readFileSync(file, 'utf8');
  const start = text.indexOf(AGENT_POLICY_START);
  const end = text.indexOf(AGENT_POLICY_END);
  if (start >= 0 && end >= start) {
    text = text.slice(0, start).replace(/\s*$/, '') + '\n\n' + AGENT_POLICY_BLOCK;
  } else {
    text = text.replace(/\s*$/, '') + '\n\n' + AGENT_POLICY_BLOCK;
  }
  fs.writeFileSync(file, text, 'utf8');
}

function restoreVerificationReports(repo) {
  for (const rel of ['ANIMATION_QUALITY_SYSTEM_REPORT.json', 'ASSET_QUALITY_REPORT.json', 'CPU_ASSET_TRANSCODE_REPORT.json', 'REAL_IOS_QUALITY_REPORT.json', 'ASSET_TOOLCHAIN_BOOTSTRAP_REPORT.json', 'SELF_IMPROVEMENT_RISK.json', 'PWA_RUNTIME_INTEGRATION_REPORT.json', 'PWA_RUNTIME_ADAPTER_REPORT.json', 'PWA_RUNTIME_DISCOVERY.json', 'QUALITY_CONVERGENCE_REPORT.json']) {
    const file = path.join(repo, rel);
    if (headBlob(repo, rel)) run('git', ['checkout', '--', rel], repo, { inherit: true });
    else fs.rmSync(file, { force: true });
  }
}

function main() {
  const repo = findRepo();
  console.log(`[PWA_INSTALL] repo=${repo}`);

  const dirty = run('git', ['status', '--porcelain'], repo);
  if (dirty) throw new Error('Working tree is not clean. Commit/stash existing work first; installer will not mix tasks.');

  for (const [rel, accepted] of Object.entries(EXPECTED_BLOBS)) {
    const actual = headBlob(repo, rel);
    if (actual && !acceptedHead(rel, actual)) {
      throw new Error(`Stale/conflicting base at ${rel}. Got ${actual}. Preserve newer work and regenerate only the semantic V4 merge; never overwrite unknown changes.`);
    }
  }

  const current = run('git', ['branch', '--show-current'], repo);
  const base = run('git', ['rev-parse', 'HEAD'], repo);
  let branch = current;
  if (!branch || branch === 'master') {
    branch = `ai/chatgpt/pwa-self-improving-${Date.now()}`;
    run('git', ['checkout', '-b', branch], repo, { inherit: true });
  }
  console.log(`[PWA_INSTALL] branch=${branch}`);

  try {
    // Repository policy requires WIP before project edits.
    copyFile(repo, 'WORK_IN_PROGRESS.md');
    ensureAgentPolicy(repo);

    const files = listFiles(PAYLOAD).filter(rel => rel !== 'WORK_IN_PROGRESS.md');
    for (const rel of files) {
      const src = path.join(PAYLOAD, ...rel.split('/'));
      const dst = path.join(repo, ...rel.split('/'));
      const head = headBlob(repo, rel);
      const existedInHead = Boolean(head);
      if (!existedInHead && fs.existsSync(dst) && !sameBytes(src, dst)) {
        throw new Error(`New-file collision at ${rel}; refusing to overwrite unrelated work.`);
      }
      if (existedInHead && !acceptedHead(rel, head)) {
        throw new Error(`Managed-file conflict at ${rel}; HEAD contains unknown changes. Preserve them and semantically rebase V4 instead of overwriting.`);
      }
      copyFile(repo, rel);
    }
  } catch (error) {
    console.error('[PWA_INSTALL] copy/policy stage failed; restoring branch to original HEAD');
    run('git', ['reset', '--hard', base], repo, { inherit: true });
    run('git', ['clean', '-fd'], repo, { inherit: true });
    throw error;
  }

  try {
    run('node', ['scripts/integrate-runtime-adapters.js', '--apply'], repo, { inherit: true });
    run('node', ['scripts/asset-quality-pipeline.js'], repo, { inherit: true });
    run('node', ['scripts/cpu-asset-transcode.js'], repo, { inherit: true });
    run('node', ['--test', 'test/pwa-system.test.js', 'test/animation-quality-validator.test.js', 'test/self-improvement-risk.test.js', 'test/runtime-integration-adapters.test.js', 'test/quality-convergence-policy.test.js', 'test/cpu-asset-transcode.test.js', 'test/quality-profile-learning.test.js', 'test/rig-adapters.test.js', 'test/runtime-integration-v4-fixture.test.js'], repo, { inherit: true });
    run('node', ['scripts/check-pwa-system.js'], repo, { inherit: true });
    run('node', ['scripts/check-animation-quality-system.js'], repo, { inherit: true });
    run('node', ['scripts/runtime-integration-discovery.js'], repo, { inherit: true });
    run('node', ['scripts/asset-quality-pipeline.js'], repo, { inherit: true });
    run('npm', ['run', 'check'], repo, { inherit: true });
  } catch (error) {
    console.error('[PWA_INSTALL] verification failed; restoring branch to original HEAD');
    run('git', ['reset', '--hard', base], repo, { inherit: true });
    run('git', ['clean', '-fd'], repo, { inherit: true });
    throw error;
  }

  restoreVerificationReports(repo);
  try {
    run('git', ['add', 'apps', 'AGENTS.md', 'WORK_IN_PROGRESS.md', 'PWA_SELF_IMPROVING_SYSTEM.md', 'DESKTOP_AI_PWA_SELF_IMPROVING.md', '.github/workflows/pwa-self-improve.yml', '.github/workflows/quality-canary.yml', 'api', 'data', 'e2e', 'offline.html', 'package.json', 'playwright.config.js', 'scripts', 'server.js', 'shared', 'supabase/migrations/20260824053000_quality_telemetry_v4.sql', 'sw.js', 'test', 'vercel.json'], repo, { inherit: true });
    run('git', ['commit', '-m', 'feat(pwa): install self-improving PWA V4 adaptive runtime'], repo, { inherit: true });
    const leftover = run('git', ['status', '--porcelain'], repo);
    if (leftover) throw new Error(`Post-install working tree is not clean:\n${leftover}`);
  } catch (error) {
    console.error('[PWA_INSTALL] commit/final cleanliness failed; restoring original HEAD');
    run('git', ['reset', '--hard', base], repo, { inherit: true });
    run('git', ['clean', '-fd'], repo, { inherit: true });
    throw error;
  }

  console.log('');
  console.log('[PWA_INSTALL] LOCAL INSTALL VERIFIED');
  console.log(`[PWA_INSTALL] branch=${branch}`);
  console.log('[PWA_INSTALL] next=run assets:toolchain (free CPU tools), assets:transcode:apply, quality:converge:full until CLEAN, apply Supabase V4 migration, integrate any semantic rigs reported as relevant, push branch, verify deployed Chromium/WebKit preview + real iOS evidence, then PR');
  console.log('[PWA_INSTALL] production was not changed directly');
}

try { main(); }
catch (error) {
  console.error(`[PWA_INSTALL] FAIL: ${error.message || error}`);
  process.exit(1);
}
