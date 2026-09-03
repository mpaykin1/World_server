'use strict';
// SCOPED_TASK_COMPILER
//
// Real fix for the confirmed bottleneck found in the previous round: giving
// a free-tier OpenCode agent the ENTIRE World_server repo via `--dir` makes
// it explore broadly before editing anything, reliably exceeding a 280s
// budget even for a genuine one-line fix (verified live:
// opencode-free-tier-timeout-on-full-repo-context in
// data/error-prevention-registry.json).
//
// Instead of shrinking the working directory (which OpenCode's `run --dir`
// doesn't support scoping further), this compiles a MINIMAL, ranked file
// set for the goal and hands those files to the agent directly via
// multiple `-f <file>` attachments, with an explicit instruction not to
// explore beyond them. The agent then needs zero/near-zero exploration
// tool calls to get the context it needs.
//
// compileContext(root, goal, level) returns { files, sources, level } for
// three progressively larger levels - the caller (lib/agent-adapters.js)
// tries level 1 first, expands to 2 then 3 only if the attempt at the
// current level fails, and only moves to the next MODEL once level 3 (the
// old "give it the whole repo" behavior) has also failed for the current
// model. This is real, measurable "progressive context expansion", not
// just a bigger number picked once.
const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','to','of','in','on','for','and','or','it','this','that','so','so-that','with','without','not','same','style','as','other','apps','app','file','only','exactly','single','line','contains','content','add','fix','edit','change','update','make','sure','line-that','tag']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'test-results', 'playwright-report']);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((w) => w.replace(/^[./]+|[./]+$/g, ''))
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Explicit path mentions in the goal are the strongest, cheapest signal -
// "apps/ai3d-voxel-city/index.html" in a goal almost always means exactly
// that file matters most.
function extractExplicitPaths(root, goal) {
  const re = /\b((?:[a-zA-Z0-9_-]+\/){0,6}[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,8})\b/g;
  const found = new Set();
  let m;
  while ((m = re.exec(String(goal || '')))) {
    const rel = m[1];
    if (fs.existsSync(path.join(root, rel))) found.add(rel.replace(/\\/g, '/'));
  }
  return [...found];
}

function knownIssueFileRefs(root, goal) {
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'error-prevention-registry.json'), 'utf8'));
    const known = Array.isArray(registry.knownErrors) ? registry.knownErrors : [];
    const words = new Set(tokenize(goal));
    const refs = new Set();
    for (const e of known) {
      const fields = [e.symptom, e.rootCause, e.id].filter(Boolean).join(' ').toLowerCase();
      const hit = [...words].some((w) => fields.includes(w));
      if (!hit) continue;
      const pathRe = /\b((?:[a-zA-Z0-9_-]+\/){0,6}[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,8})\b/g;
      let m;
      while ((m = pathRe.exec(fields))) if (fs.existsSync(path.join(root, m[1]))) refs.add(m[1]);
    }
    return [...refs];
  } catch { return []; }
}

function listFilesShallow(root, dir, maxFiles) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return [];
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < maxFiles) {
    const rel = stack.shift();
    const full = path.join(root, rel);
    let entries;
    try { entries = fs.readdirSync(full, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const childRel = path.join(rel, ent.name).replace(/\\/g, '/');
      if (ent.isDirectory()) stack.push(childRel);
      else if (out.length < maxFiles) out.push(childRel);
    }
  }
  return out;
}

// Cheap keyword relevance search over a bounded slice of the repo tree
// (never a full recursive walk of node_modules-scale directories) -
// ranks files whose path contains goal keywords.
function keywordSearch(root, goal, maxFiles) {
  const words = tokenize(goal);
  if (!words.length) return [];
  const topDirs = ['apps', 'scripts', 'lib', 'api', 'data', 'shared', 'test'].filter((d) => fs.existsSync(path.join(root, d)));
  const candidates = [];
  for (const dir of topDirs) candidates.push(...listFilesShallow(root, dir, 4000));
  const scored = candidates
    .map((rel) => {
      const lower = rel.toLowerCase();
      const score = words.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
      return { rel, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map((c) => c.rel);
  return scored;
}

const LEVELS = {
  1: { maxFiles: 5, includeDir: false, description: 'explicit/keyword-matched files only' },
  2: { maxFiles: 20, includeDir: true, description: 'level 1 files + their containing directories' },
  3: { maxFiles: null, includeDir: false, description: 'full repo (--dir, no file attachments) - last resort' },
};

function compileContext(root, goal, level = 1) {
  if (level >= 3) return { files: [], level: 3, full: true, sources: ['full-repo-fallback'] };

  const explicit = extractExplicitPaths(root, goal);
  const knownIssue = knownIssueFileRefs(root, goal);
  const keyword = keywordSearch(root, goal, 8);
  let files = [...new Set([...explicit, ...knownIssue, ...keyword])];
  const sources = { explicit, knownIssue, keyword };

  if (level >= 2) {
    const dirs = new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== '.'));
    for (const d of dirs) files.push(...listFilesShallow(root, d, 15));
    files = [...new Set(files)];
  }

  const cap = LEVELS[level].maxFiles;
  if (cap) files = files.slice(0, cap);

  return { files, level, full: false, sources };
}

module.exports = { compileContext, extractExplicitPaths, knownIssueFileRefs, keywordSearch, tokenize, LEVELS };
