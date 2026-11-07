#!/usr/bin/env node
// Sync only independently audited, exact-source META GAMES components.
// Usage: node sync-lab-components.mjs --lab <meta6-lab-checkout> --source <meta6-checkout> [--apply]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(directory, 'ASSET_INDEX.json');
const rightsPath = join(directory, 'RIGHTS_REVIEW.json');
const args = process.argv.slice(2);
function arg(flag) {
  const at = args.indexOf(flag);
  if (at < 0 || !args[at + 1] || args[at + 1].startsWith('--')) {
    throw Error('Required flag: ' + flag);
  }
  return resolve(args[at + 1]);
}
const labRoot = arg('--lab');
const sourceRoot = arg('--source');
const apply = args.includes('--apply');
const ownerGrant = 'LicenseRef-Owner-Grant-META-GAMES-2026-11-06';
const gameIds = new Map([
  ['twilight-island', 'observer-v7'],
  ['ashen-path', 'ashen'],
  ['underwater-world', 'underwater'],
  ['three-worlds', 'three-worlds'],
  ['veil-terraces', 'veil-terraces']
]);
const permittedRoots = [
  'observer-world-en-v7/', 'ashen-sumerek/', 'underwater-world/',
  'three-worlds-game/', 'meta-games-worlds/veil-terraces/'
];
const kinds = new Map([
  ['audio', 'audio_logic'], ['buildings', 'geometry'], ['combat', 'combat'],
  ['controls', 'controls'], ['characters', 'npc_ai'], ['story', 'story'],
  ['input', 'input'], ['weather', 'weather']
]);
function git(cwd, ...argv) {
  return execFileSync('git', argv, { cwd, maxBuffer: 16 * 1024 * 1024 });
}
function assertCanonical(cwd, expected) {
  const remote = git(cwd, 'remote', 'get-url', 'origin').toString().trim();
  const canonical = new RegExp('^(?:https://github\\.com/|git@github\\.com:)' +
    expected.replace('/', '\\/') + '(?:\\.git)?$');
  if (!canonical.test(remote)) throw Error('Incorrect repository origin: ' + cwd);
}
function gitBlobSha(bytes) {
  return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex');
}
function safePath(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_./-]+$/.test(value) &&
    !value.startsWith('/') && !value.split('/').includes('..');
}
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function assertSource(component, catalog) {
  const src = component.source;
  if (src?.repository !== 'mpaykin1/meta6' || !/^[a-f0-9]{40}$/.test(src.commit) ||
      !/^[a-f0-9]{40}$/.test(src.git_blob_sha) || !safePath(src.path) ||
      !permittedRoots.some(prefix => src.path.startsWith(prefix))) {
    throw Error('Unapproved source: ' + component.id);
  }
  if (src.commit !== catalog.source_commit) throw Error('Pinned commit mismatch: ' + component.id);
  git(sourceRoot, 'cat-file', '-e', src.commit + ':rules/06-rabota-ii-s-kodom/META_GAMES_SOURCE_ALLOWLIST.md');
  if (component.license !== ownerGrant || (component.license_evidence &&
      !component.license_evidence.includes('/rules/06-rabota-ii-s-kodom/META_GAMES_SOURCE_ALLOWLIST.md'))) {
    throw Error('Owner grant missing: ' + component.id);
  }
  const file = component.entry;
  if (!safePath(file) || file.includes('/')) throw Error('Unsafe entry: ' + component.id);
  const sharedFile = join(labRoot, 'shared', 'components', component.id, file);
  const copied = readFileSync(sharedFile);
  const canonical = git(sourceRoot, 'show', src.commit + ':' + src.path);
  const found = gitBlobSha(canonical);
  if (found !== src.git_blob_sha || !copied.equals(canonical)) {
    throw Error('Non-identical shared source: ' + component.id);
  }
  const tree = git(sourceRoot, 'rev-parse', src.commit + ':' + src.path).toString().trim();
  if (tree !== src.git_blob_sha) throw Error('Git blob provenance mismatch: ' + component.id);
}
assertCanonical(labRoot, 'mpaykin1/meta6-lab');
assertCanonical(sourceRoot, 'mpaykin1/meta6');
const catalog = readJson(indexPath);
const rights = readJson(rightsPath);
const shared = readJson(join(labRoot, 'shared/index.json'));
if (catalog.schema_version !== 1 || rights.schema_version !== 1 ||
    shared.schema_version !== 1 || !Array.isArray(shared.components)) {
  throw Error('Unsupported catalog or shared schema');
}
const existing = new Map([...catalog.reusable_assets, ...catalog.review_candidates].map(a => [a.id, a]));
const audits = new Map(rights.entries.map(a => [a.id, a]));
const additions = [];
const skipped = [];
for (const entry of shared.components) {
  if (!/^[a-z0-9-]+$/.test(entry.id)) throw Error('Invalid component ID: ' + entry.id);
  const detail = readJson(join(labRoot, 'shared/components', entry.id, 'component.json'));
  if (JSON.stringify(entry) !== JSON.stringify(detail)) {
    throw Error('Component metadata differs from shared index: ' + entry.id);
  }
  assertSource(entry, catalog);
  const a = audits.get(entry.id);
  const current = existing.get(entry.id);
  if (current && (current.source.path !== entry.source.path ||
      current.source.git_blob_sha !== entry.source.git_blob_sha ||
      current.source.commit !== entry.source.commit)) {
    throw Error('Existing source differs: ' + entry.id);
  }
  if (catalog.reusable_assets.some(x => x.id === entry.id)) continue;
  if (!a || a.license_status !== 'verified' || a.reuse_allowed !== true ||
      a.redistribution_allowed !== true || a.dependencies_verified !== true ||
      !a.grant_evidence || a.source_path !== entry.source.path ||
      a.git_blob_sha !== entry.source.git_blob_sha) {
    skipped.push(entry.id + ': independent rights/dependency audit required');
    continue;
  }
  const game_id = gameIds.get(entry.source.game);
  const type = kinds.get(entry.kind);
  if (!game_id || !type || !catalog.games.some(x => x.id === game_id)) {
    throw Error('Unknown game or component type: ' + entry.id);
  }
  const src = entry.source;
  const asset = current ? { ...current } : {
    id: entry.id, game_id, type, format: src.path.split('.').pop(),
    version: src.commit,
    source: { repository: src.repository, commit: src.commit, path: src.path,
      git_blob_sha: src.git_blob_sha,
      url: 'https://github.com/mpaykin1/meta6/blob/' + src.commit + '/' + src.path }
  };
  asset.license_status = 'verified';
  asset.reuse_allowed = true;
  asset.redistribution_allowed = true;
  asset.dependencies_verified = true;
  asset.dependencies = [];
  asset.license_id = ownerGrant;
  asset.grant_evidence = a.grant_evidence;
  asset.review_note = a.review_note || 'Independent rights review verified';
  // Only promote an existing audited entry; never set rights without evidence.
  catalog.review_candidates = catalog.review_candidates.filter(x => x.id !== entry.id);
  catalog.reusable_assets.push(asset);
  existing.set(entry.id, asset);
  additions.push(entry.id);
}
const seen = new Set();
for (const asset of [...catalog.reusable_assets, ...catalog.review_candidates]) {
  if (seen.has(asset.id)) throw Error('Duplicate catalog ID: ' + asset.id);
  seen.add(asset.id);
  if (!audits.has(asset.id)) throw Error('Missing paired rights review: ' + asset.id);
}
if (additions.length && apply) {
  const originalIndex = readFileSync(indexPath);
  const originalRights = readFileSync(rightsPath);
  const firstTmp = indexPath + '.sync.tmp';
  const secondTmp = rightsPath + '.sync.tmp';
  try {
    writeFileSync(firstTmp, JSON.stringify(catalog, null, 2) + '\n');
    writeFileSync(secondTmp, JSON.stringify(rights, null, 2) + '\n');
    renameSync(firstTmp, indexPath);
    renameSync(secondTmp, rightsPath);
    execFileSync(process.execPath, [join(directory, 'catalog.mjs'), 'validate'], { cwd: directory });
  } catch (error) {
    writeFileSync(indexPath, originalIndex);
    writeFileSync(rightsPath, originalRights);
    throw error;
  } finally {
    rmSync(firstTmp, { force: true });
    rmSync(secondTmp, { force: true });
  }
}
console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run', audited_shared_components: shared.components.length,
  promoted: additions, skipped, catalog_reusable_total: catalog.reusable_assets.length
}, null, 2));
