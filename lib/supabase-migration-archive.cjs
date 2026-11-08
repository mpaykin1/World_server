'use strict';

// Private, full-database evidence only. Connection/TLS configuration belongs to
// runPg; it must throw on nonzero exit and return stdout (string or { stdout }).
// Listing an archive is never a restore rehearsal or a migration readiness claim.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const metadataKeys = new Set(['label', 'toolVersion', 'scope', 'snapshot', 'project_ref', 'migration_id']);
const archiveContract = Object.freeze({
  format: 'custom', scope: 'whole_database', schemas: 'all', data: 'all',
  ownership: 'preserved', privileges: 'preserved', exclusions: 'none'
});

function fail(message) { throw new Error(message); }
function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function noSymlinks(directory) {
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) fail('Archive paths must not contain symlinks');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function privateStat(stat, mode, directory = false) {
  if ((directory ? !stat.isDirectory() : !stat.isFile()) ||
      (stat.mode & 0o777) !== mode || (!directory && stat.nlink !== 1) ||
      (process.getuid && stat.uid !== process.getuid())) {
    fail('Archive evidence must be private, owned, and have no additional links');
  }
}
function pathsFor({ directory, label, repositoryRoot }, create) {
  if (typeof label !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(label)) fail('Invalid archive label');
  if (typeof directory !== 'string' || !directory || typeof repositoryRoot !== 'string' || !repositoryRoot) {
    fail('Archive directory and repositoryRoot are required');
  }
  const folder = path.resolve(directory);
  const repository = fs.realpathSync(repositoryRoot);
  noSymlinks(folder);
  if (inside(folder, repository)) fail('Database archives must remain outside the checkout');
  if (create) fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  noSymlinks(folder);
  privateStat(fs.lstatSync(folder), 0o700, true);
  if (inside(fs.realpathSync(folder), repository)) fail('Database archives must remain outside the checkout');
  return {
    folder,
    archivePath: path.join(folder, label + '.dump'),
    tocPath: path.join(folder, label + '.toc'),
    manifestPath: path.join(folder, label + '.manifest.json')
  };
}
function openPrivate(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { privateStat(fs.fstatSync(fd), 0o600); } catch (error) { fs.closeSync(fd); throw error; }
  return fd;
}
function readPrivate(file) {
  const fd = openPrivate(file);
  try { return fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
}
function syncDirectory(folder) {
  const fd = fs.openSync(folder, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function writeExclusive(file, contents) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function cleanMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('Invalid archive metadata');
  const clean = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!metadataKeys.has(key) || typeof value !== 'string' || value.length > 256 ||
        /[\x00-\x1f\x7f]|:\/\/|sb_(?:secret|publishable)_|\beyJ[A-Za-z0-9_-]+\./i.test(value)) {
      fail('Archive metadata only accepts bounded noncredential provenance strings');
    }
    clean[key] = value;
  }
  return clean;
}
async function pgOutput(runPg, binary, args) {
  if (typeof runPg !== 'function') fail('runPg callback is required');
  let output;
  try { output = await runPg(binary, args, { capture: true }); }
  catch { fail(binary + ' failed; inspect private diagnostics'); }
  const value = typeof output === 'string' ? output : output && output.stdout;
  if (typeof value !== 'string') fail(binary + ' did not return captured stdout');
  return value;
}
function tocEntries(value) {
  const entries = value.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith(';'));
  if (!entries.length || entries.some(line => !/^\d+;\s+\d+\s+\d+\s+\S/.test(line))) fail('Archive TOC has no valid object listing');
  return entries.join('\n');
}
async function digest(file, requireSignature = false) {
  const fd = openPrivate(file);
  const before = fs.fstatSync(fd);
  try {
    if (before.size === 0) fail('Archive evidence is empty');
    if (requireSignature) {
      const magic = Buffer.alloc(5);
      fs.readSync(fd, magic, 0, 5, 0);
      if (magic.toString('ascii') !== 'PGDMP') fail('Invalid custom archive signature');
    }
    const hash = crypto.createHash('sha256');
    for await (const chunk of fs.createReadStream(file, { fd, start: 0, autoClose: false })) hash.update(chunk);
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail('Archive changed during verification');
    return { bytes: after.size, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}
function assertManifest(manifest, label) {
  if (!manifest || manifest.version !== 1 || manifest.label !== label ||
      !manifest.archive || !manifest.toc || !manifest.created_at ||
      JSON.stringify(manifest.contract) !== JSON.stringify(archiveContract) ||
      JSON.stringify(manifest.restore_rehearsal) !== JSON.stringify({ status: 'NOT_RUN' })) {
    fail('Invalid archive manifest contract');
  }
  cleanMetadata(manifest.metadata);
  for (const entry of [manifest.archive, manifest.toc]) {
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail('Invalid archive digest manifest');
  }
}

async function backupArchive(options) {
  const metadata = cleanMetadata(options.metadata);
  const files = pathsFor(options, true);
  for (const file of [files.archivePath, files.tocPath, files.manifestPath]) {
    try { fs.lstatSync(file); fail('Archive output already exists; use a new label'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Reserve the output privately before pg_dump opens it; partial failure never
  // produces a success manifest, and a retry cannot overwrite retained evidence.
  writeExclusive(files.archivePath, '');
  await pgOutput(options.runPg, 'pg_dump', ['--format=custom', '--file=' + files.archivePath]);
  const archive = await digest(files.archivePath, true);
  const archiveFd = openPrivate(files.archivePath);
  try { fs.fsyncSync(archiveFd); } finally { fs.closeSync(archiveFd); }
  const toc = await pgOutput(options.runPg, 'pg_restore', ['--list', files.archivePath]);
  tocEntries(toc);
  writeExclusive(files.tocPath, toc);
  const manifest = {
    version: 1, label: options.label, created_at: new Date().toISOString(),
    contract: archiveContract, metadata, archive, toc: await digest(files.tocPath),
    restore_rehearsal: { status: 'NOT_RUN' }
  };
  // Ensure artifact directory entries are durable before publishing the manifest.
  syncDirectory(files.folder);
  writeExclusive(files.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  syncDirectory(files.folder);
  return { archivePath: files.archivePath, manifestPath: files.manifestPath, manifest };
}

async function verifyArchive(options) {
  const files = pathsFor(options, false);
  let manifest;
  try { manifest = JSON.parse(readPrivate(files.manifestPath)); }
  catch { fail('Cannot read private archive manifest'); }
  assertManifest(manifest, options.label);
  const archive = await digest(files.archivePath, true);
  const toc = await digest(files.tocPath);
  if (JSON.stringify(archive) !== JSON.stringify(manifest.archive) || JSON.stringify(toc) !== JSON.stringify(manifest.toc)) {
    fail('Archive evidence digest mismatch');
  }
  const current = await pgOutput(options.runPg, 'pg_restore', ['--list', files.archivePath]);
  if (tocEntries(current) !== tocEntries(readPrivate(files.tocPath))) fail('Archive TOC changed');
  return { archivePath: files.archivePath, manifestPath: files.manifestPath, manifest };
}

module.exports = { backupArchive, verifyArchive };
