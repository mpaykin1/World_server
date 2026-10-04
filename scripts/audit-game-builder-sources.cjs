'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(process.env.LOCALAPPDATA || path.dirname(__dirname), 'WorldServerAI');
const SRC_ROOT = path.join(ROOT, 'sources', 'game-builder-audit');
const OUT_ROOT = path.join(ROOT, 'audits', 'game-builder-20261004');
const WORKTREE = path.resolve(__dirname, '..');
const REPO_LEDGER_PATH = 'docs/audits/GAME_BUILDER_OSS_FILE_DECISIONS.json';

const REPOS = {
  'gbg-editor': ['https://github.com/jaames/game-builder-garage-editor.git', 'MPL-2.0'],
  gdevelop: ['https://github.com/4ian/GDevelop.git', 'MIT'],
  armory: ['https://github.com/armory3d/armory.git', 'Zlib'],
  microstudio: ['https://github.com/pmgl/microstudio.git', 'MIT'],
  ctjs: ['https://github.com/ct-js/ct-js.git', 'MIT'],
  rete: ['https://github.com/retejs/rete.git', 'MIT'],
  litegraph: ['https://github.com/jagenjo/litegraph.js.git', 'MIT']
};

const SOURCE_EXTS = new Set([
  '.js','.mjs','.cjs','.ts','.tsx','.jsx','.hx','.h','.hpp','.c','.cc','.cpp','.cs','.rs','.py','.lua',
  '.glsl','.vert','.frag','.wgsl','.json'
]);
const BINARY_EXTS = new Set([
  '.png','.jpg','.jpeg','.gif','.webp','.ico','.mp3','.ogg','.wav','.flac','.mp4','.mov','.avi','.blend',
  '.fbx','.glb','.gltf','.ttf','.otf','.woff','.woff2','.zip','.7z','.rar','.pdf','.exe','.dll','.so','.dylib'
]);
const SKIP_DIRS = new Set(['.git','.github','.idea','.vscode','node_modules','dist','build','coverage','docs','doc','website','screenshots']);
const META_NAMES = new Set(['readme','license','licence','copying','changelog','changes','authors','contributors','code_of_conduct','contributing','security']);
const LOCKS = new Set(['package-lock.json','yarn.lock','pnpm-lock.yaml','bun.lockb','bun.lock','composer.lock']);
const TEST_MARKERS = ['/test/','/tests/','/__tests__','.test.','.spec.','/e2e/','/ci/'];
const GENERATED_MARKERS = ['/generated/','/vendor/','/thirdparty/','/third_party/','/extern/','/external/'];

const INTEREST = {
  'gbg-editor': ['nodon','gamepacket','save','texture','connection','graph','viewer','gltf'],
  gdevelop: ['event','behavior','behaviour','extension','scene','runtime','project','export'],
  armory: ['logicnode','logic_node','node','physics','nav','scene','input'],
  microstudio: ['project','runtime','runner','editor','scene','asset','sandbox','player'],
  ctjs: ['catnip','room','behavior','behaviour','event','editor','project'],
  rete: ['node','socket','connection','editor','engine','area','history','preset','classic','scope','types'],
  litegraph: ['litegraph','graph','node','canvas','editor','serialize','events','logic']
};

function run(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function ensureRepo(name, url) {
  const repo = path.join(SRC_ROOT, name);
  if (!fs.existsSync(repo)) {
    execFileSync('git', ['clone','--depth=1','--filter=blob:none','--no-checkout',url,repo], { stdio: 'inherit' });
    return repo;
  }
  try { run(['fetch','--depth=1','origin'], repo); } catch {}
  return repo;
}

function treeEntries(repo) {
  const raw = execFileSync('git', ['ls-tree','-r','-z','HEAD'], {
    cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  return raw.split('\0').filter(Boolean).map(record => {
    const [left, filePath] = record.split('\t');
    const [mode, type, sha] = left.split(' ');
    return { mode, type, sha, path: filePath.replaceAll('\\','/') };
  });
}

function isMeta(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const stem = path.parse(name).name;
  return META_NAMES.has(stem) || LOCKS.has(name);
}

function commonDecision(entry) {
  const lower = '/' + entry.path.toLowerCase().replace(/^\/+/, '');
  const ext = path.extname(entry.path).toLowerCase();
  const parts = entry.path.toLowerCase().split('/');
  if (entry.mode === '160000') return 'PRESERVE-FOR-LATER';
  if (isMeta(entry.path)) return 'SKIP';
  if (TEST_MARKERS.some(marker => lower.includes(marker))) return 'PRESERVE-FOR-LATER';
  if (GENERATED_MARKERS.some(marker => lower.includes(marker))) return 'SKIP';
  if (parts.some(part => SKIP_DIRS.has(part))) return 'SKIP';
  if (parts.includes('example') || parts.includes('examples')) return 'PRESERVE-FOR-LATER';
  if (BINARY_EXTS.has(ext) || !SOURCE_EXTS.has(ext)) return 'SKIP';
  return null;
}

function classify(name, entry) {
  const common = commonDecision(entry);
  if (common) return common;
  const lower = '/' + entry.path.toLowerCase().replace(/^\/+/, '');
  const hit = (INTEREST[name] || []).some(key => lower.includes(key));
  if (name === 'gbg-editor' || name === 'armory') return hit ? 'LEARN-REIMPLEMENT' : 'SKIP';
  if (name === 'rete' || name === 'litegraph') return hit ? 'ADAPT' : 'SKIP';
  if (name === 'ctjs') {
    if (lower.includes('catnip')) return 'LEARN-REIMPLEMENT';
    return hit ? 'PRESERVE-FOR-LATER' : 'SKIP';
  }
  if (name === 'gdevelop' || name === 'microstudio') return hit ? 'ADAPT' : 'SKIP';
  return 'SKIP';
}

function licenseExcerpt(repo) {
  const names = run(['ls-tree','-r','--name-only','HEAD'], repo).split(/\r?\n/);
  const candidate = names.find(name => /^(license|licence|copying)(\.(md|txt))?$/i.test(path.basename(name)));
  if (!candidate) return '';
  try {
    return run(['show', `HEAD:${candidate}`], repo).replace(/\s+/g, ' ').slice(0, 800);
  } catch {
    return '';
  }
}

function emptyDecisionMap() {
  return {
    IMPORT: [],
    ADAPT: [],
    'LEARN-REIMPLEMENT': [],
    'PRESERVE-FOR-LATER': [],
    SKIP: []
  };
}

function auditRepo(name, spec, ledger) {
  const [url, declaredLicense] = spec;
  const repo = ensureRepo(name, url);
  const commit = run(['rev-parse','HEAD'], repo);
  const entries = treeEntries(repo);
  const decisions = emptyDecisionMap();
  for (const entry of entries) decisions[classify(name, entry)].push(entry.path);
  ledger.repositories[name] = {
    repository: url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, ''),
    commit,
    license: declaredLicense,
    file_count: entries.length,
    decisions
  };
  return {
    url,
    commit,
    declared_license: declaredLicense,
    license_excerpt: licenseExcerpt(repo),
    file_count: entries.length,
    decisions: Object.fromEntries(Object.entries(decisions).filter(([,paths]) => paths.length).map(([decision,paths]) => [decision, paths.length]))
  };
}

function writeOutputs(summary, ledger) {
  const repoLedger = path.join(WORKTREE, REPO_LEDGER_PATH);
  const localLedger = path.join(OUT_ROOT, 'full-classification.json');
  fs.mkdirSync(path.dirname(repoLedger), { recursive: true });
  fs.writeFileSync(repoLedger, JSON.stringify(ledger));
  fs.writeFileSync(localLedger, JSON.stringify(ledger));
  fs.writeFileSync(path.join(OUT_ROOT, 'summary.json'), JSON.stringify(summary, null, 2));
  return localLedger;
}

function compactSummary(summary, localLedger) {
  return {
    generated_at: summary.generated_at,
    method: summary.method,
    full_audit_local_path: localLedger,
    full_audit_repo_path: REPO_LEDGER_PATH,
    repos: Object.fromEntries(Object.entries(summary.repos).map(([name, repo]) => [name, {
      url: repo.url,
      commit: repo.commit,
      declared_license: repo.declared_license,
      file_count: repo.file_count,
      decisions: repo.decisions
    }]))
  };
}

function main() {
  fs.mkdirSync(SRC_ROOT, { recursive: true });
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const ledger = {
    schema_version: '1.0.0',
    generated_at: '2026-10-04',
    method: '100% git-tree enumeration at pinned commits; every file/submodule path receives exactly one pre-integration decision',
    decision_order: ['IMPORT','ADAPT','LEARN-REIMPLEMENT','PRESERVE-FOR-LATER','SKIP'],
    repositories: {}
  };
  const summary = {
    generated_at: '2026-10-04',
    method: '100% git-tree enumeration + deterministic per-file classification; blobs fetched only for selected content review',
    repos: {}
  };

  for (const [name, spec] of Object.entries(REPOS)) summary.repos[name] = auditRepo(name, spec, ledger);
  ledger.total_files = Object.values(ledger.repositories).reduce((total, item) => total + item.file_count, 0);
  const localLedger = writeOutputs(summary, ledger);
  const compact = compactSummary(summary, localLedger);
  fs.writeFileSync(path.join(WORKTREE, 'docs', 'GAME_BUILDER_OSS_AUDIT_SUMMARY.json'), JSON.stringify(compact, null, 2));
  console.log(JSON.stringify(compact, null, 2));
}

main();
