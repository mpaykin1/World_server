'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, '.world-server-state');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.world-server-state', '.system-integration-backups', '.quality-autopilot-state']);

function norm(p) { return p.replaceAll('\\', '/').replace(/^\.\//, ''); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function shaBuffer(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function shaFile(p) { return shaBuffer(fs.readFileSync(p)); }
function readJSON(p, fallback = null) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }
function atomicWrite(file, content) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}
function writeJSON(file, value) { atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`); }
function run(cmd, args = [], options = {}) {
  try {
    const stdout = cp.execFileSync(cmd, args, { cwd: options.cwd || ROOT, encoding: 'utf8', stdio: options.stdio || ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(options.env || {}) } });
    return { ok: true, stdout: String(stdout || '').trim(), code: 0 };
  } catch (e) {
    return { ok: false, stdout: String(e.stdout || '').trim(), stderr: String(e.stderr || e.message || '').trim(), code: Number.isInteger(e.status) ? e.status : 1 };
  }
}
function git(args) { return run('git', args); }
function gitBranch() { const r = git(['branch', '--show-current']); return r.ok ? r.stdout : ''; }
function gitCommit() { const r = git(['rev-parse', 'HEAD']); return r.ok ? r.stdout : ''; }
function gitStatusFiles() {
  try {
    const tracked = cp.execFileSync('git', ['diff', '--name-only', '-z', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    const untracked = cp.execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: ROOT, encoding: 'utf8' });
    return [...new Set((tracked + untracked).split('\0').filter(Boolean).map(norm))].filter(rel => !rel.split('/').some(p => SKIP_DIRS.has(p))).sort();
  } catch { return []; }
}
function walkFallback(dir = ROOT, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && SKIP_DIRS.has(ent.name)) continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFallback(abs, out);
    else if (ent.isFile()) out.push(norm(path.relative(ROOT, abs)));
  }
  return out;
}
function projectFiles() {
  const r = git(['ls-files', '-co', '--exclude-standard', '-z']);
  const files = r.ok && r.stdout ? r.stdout.split('\0').filter(Boolean).map(norm) : walkFallback();
  return [...new Set(files)].filter(rel => {
    const parts = rel.split('/');
    return !parts.some(p => SKIP_DIRS.has(p)) && fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile();
  }).sort();
}
function commandExists(name) {
  const probe = process.platform === 'win32' ? run('where', [name]) : run('sh', ['-lc', `command -v ${name}`]);
  return probe.ok && Boolean(probe.stdout);
}
function nowIso() { return new Date().toISOString(); }
function safeLabel(s = 'snapshot') { return String(s).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'snapshot'; }

module.exports = { ROOT, STATE_DIR, SKIP_DIRS, norm, ensureDir, shaBuffer, shaFile, readJSON, writeJSON, atomicWrite, run, git, gitBranch, gitCommit, gitStatusFiles, projectFiles, commandExists, nowIso, safeLabel };
