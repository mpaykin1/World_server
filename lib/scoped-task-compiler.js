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

// Real bug found and root-caused live this cycle (point 1's A/B trace): a
// real, single-file goal ("add viewport-fit=cover to
// apps/ai3d-voxel-city/index.html") was pulling in lib/agent-adapters.js,
// lib/resource-scheduler.js, lib/ollama-patch-adapter.js and a benchmark
// JSON as "context" - none of them relevant to the actual edit. Two
// distinct causes, both fixed below:
//  1. Plain substring matching (`fields.includes(w)`) matched "cover"
//     inside "discovery" and short generic words ("name", "meta",
//     "existing") inside unrelated prose almost everywhere - fixed by
//     requiring a real word-boundary match via `wordSet`, and requiring at
//     least 2 distinct matched words before a knownError entry is trusted
//     to contribute a file ref at all (one incidental generic-word overlap
//     is not real evidence of relevance).
//  2. This project's OWN knownErrors entries about the agent pipeline's
//     reliability (this exact cycle's prior debugging - "ollama-local-
//     patch-reliability-lower-than-opencode...", "opencode-free-tier-
//     timeout-on-full-repo-context") describe THIS pipeline's own source
//     files (lib/agent-adapters.js etc) in their rootCause text, and were
//     written using almost the same task description this benchmark keeps
//     reusing - so even a stricter word-match threshold still matches
//     them. Those file mentions are diagnostic commentary about the AGENT
//     ITSELF, never a legitimate small-task edit target inferred from
//     keywords - excluded outright, the same defense-in-depth spirit as
//     ollama-patch-adapter's own BLOCKED_PATH_SEGMENTS. A goal that
//     genuinely wants to edit one of these still can via
//     extractExplicitPaths (naming it directly), which this exclusion does
//     not touch.
const SELF_REFERENTIAL_INFRA_RE = /^(lib\/(agent-|ollama-|resource-scheduler|scoped-task-compiler|autonomous-issue-picker)|ollama_model_benchmark\.json$|.*_REPORT\.json$|.*benchmark.*\.json$)/i;

function wordBoundaryHit(fieldsLower, wordSet) {
  const matched = [];
  for (const w of wordSet) {
    const re = new RegExp(`(?:^|[^a-z0-9_./-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9_./-])`);
    if (re.test(fieldsLower)) matched.push(w);
  }
  return matched;
}

// Point 4 (this new cycle): returns per-file MATCH EVIDENCE, not just a
// bare path list, so a caller can compute a real relevance score and log
// WHY a file was selected instead of a compiler decision nobody can
// inspect after the fact. `entryId` (the knownError's own real registry
// id) is kept so the reason string can point at the exact real entry that
// caused the match, not just "some keyword matched somewhere".
function knownIssueFileRefsScored(root, goal) {
  try {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'error-prevention-registry.json'), 'utf8'));
    const known = Array.isArray(registry.knownErrors) ? registry.knownErrors : [];
    const words = new Set(tokenize(goal));
    const byFile = new Map();
    for (const e of known) {
      const fields = [e.symptom, e.rootCause, e.id].filter(Boolean).join(' ').toLowerCase();
      const matched = wordBoundaryHit(fields, words);
      if (matched.length < 2) continue; // one incidental generic-word overlap is not real evidence
      const pathRe = /\b((?:[a-zA-Z0-9_-]+\/){0,6}[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,8})\b/g;
      let m;
      while ((m = pathRe.exec(fields))) {
        if (SELF_REFERENTIAL_INFRA_RE.test(m[1])) continue;
        if (!fs.existsSync(path.join(root, m[1]))) continue;
        const prev = byFile.get(m[1]);
        if (!prev || matched.length > prev.matchedWords.length) byFile.set(m[1], { file: m[1], matchedWords: matched, entryId: e.id });
      }
    }
    return [...byFile.values()];
  } catch { return []; }
}

function knownIssueFileRefs(root, goal) {
  return knownIssueFileRefsScored(root, goal).map((r) => r.file);
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
// ranks files whose path contains goal keywords. Scored variant exposes
// the actual matched words per file (see knownIssueFileRefsScored's own
// comment for why - real WHY_SELECTED evidence, not a black box).
function keywordSearchScored(root, goal, maxFiles) {
  const words = tokenize(goal);
  if (!words.length) return [];
  const topDirs = ['apps', 'scripts', 'lib', 'api', 'data', 'shared', 'test'].filter((d) => fs.existsSync(path.join(root, d)));
  const candidates = [];
  for (const dir of topDirs) candidates.push(...listFilesShallow(root, dir, 4000));
  return candidates
    .filter((rel) => !SELF_REFERENTIAL_INFRA_RE.test(rel))
    .map((rel) => {
      // Same word-boundary fix as knownIssueFileRefs: a raw substring
      // check matched "cover" inside "discover-ai3d-engines.js" - a real
      // path-segment split avoids matching a keyword that's only a
      // substring of a real, different path segment.
      const segments = rel.toLowerCase().split(/[\/_.-]+/).filter(Boolean);
      const segSet = new Set(segments);
      const matchedWords = words.filter((w) => segSet.has(w));
      return { file: rel, matchedWords };
    })
    .filter((c) => c.matchedWords.length > 0)
    .sort((a, b) => b.matchedWords.length - a.matchedWords.length)
    .slice(0, maxFiles);
}

function keywordSearch(root, goal, maxFiles) {
  return keywordSearchScored(root, goal, maxFiles).map((r) => r.file);
}

// Point 4 (this new cycle): "before calling the model: selected files ->
// relevance score -> exclude low-causal-relevance files. Log WHY_SELECTED
// for every file." A candidate's score is not a single opaque number
// picked out of nowhere - it is built from real signals already collected
// above: how it was found (explicit mention is definitionally certain),
// how many distinct goal words matched it, whether those words are
// specific (>=6 chars, e.g. "voxel", "viewport") rather than generic
// short filler, and whether it lives alongside a file the goal explicitly
// named (a sibling of a certain hit is more likely a genuine dependency
// than an unrelated file that merely shares vocabulary).
const MIN_RELEVANCE_SCORE = { explicit: 0, knownIssue: 6, keyword: 3 };

function scoreCandidate({ file, source, matchedWords = [], explicitPaths = [] }) {
  const reasons = [];
  let score = 0;
  if (source === 'explicit') {
    score = 1000;
    reasons.push('explicitly named in the goal text');
  } else {
    for (const w of matchedWords) {
      const weight = w.length >= 6 ? 3 : 1;
      score += weight;
    }
    reasons.push(`matched word(s): ${matchedWords.join(', ')} (source: ${source})`);
    // A true SIBLING (same containing directory, e.g. both under
    // apps/ai3d-voxel-city/) is real evidence of relatedness - comparing
    // only the top-level segment ("apps") would count almost every app
    // file in the repo as "related" to almost every other one, which is
    // not a meaningful signal at all.
    const explicitDirs = new Set(explicitPaths.map((p) => path.posix.dirname(p)));
    if (explicitDirs.has(path.posix.dirname(file))) {
      score += 5;
      reasons.push('shares a containing directory with an explicitly-named file');
    }
  }
  return { file, source, score, reasons };
}

const LEVELS = {
  1: { maxFiles: 5, includeDir: false, description: 'explicit/keyword-matched files only' },
  2: { maxFiles: 20, includeDir: true, description: 'level 1 files + their containing directories' },
  3: { maxFiles: null, includeDir: false, description: 'full repo (--dir, no file attachments) - last resort' },
};

function compileContext(root, goal, level = 1) {
  if (level >= 3) return { files: [], level: 3, full: true, sources: ['full-repo-fallback'], whySelected: {} };

  const explicit = extractExplicitPaths(root, goal);
  const knownIssueScored = knownIssueFileRefsScored(root, goal);
  const keywordScored = keywordSearchScored(root, goal, 8);
  const sources = { explicit, knownIssue: knownIssueScored.map((r) => r.file), keyword: keywordScored.map((r) => r.file) };

  // Real relevance ranking (point 4): every candidate - explicit,
  // knownIssue, keyword - gets scored by scoreCandidate, a candidate below
  // its source's minimum relevance floor is dropped outright (a lone weak
  // match is not real evidence), and the survivors are ranked by score
  // rather than kept in whatever order their source happened to produce
  // them. The explicit set is exempt from the floor by construction
  // (score 1000, always kept) - it is the strongest, cheapest signal this
  // compiler has.
  const candidates = new Map(); // file -> best {file, source, score, reasons}
  for (const file of explicit) {
    const c = scoreCandidate({ file, source: 'explicit', explicitPaths: explicit });
    candidates.set(file, c);
  }
  for (const r of knownIssueScored) {
    if (candidates.has(r.file)) continue; // already explicit - stronger signal wins
    const c = scoreCandidate({ file: r.file, source: 'knownIssue', matchedWords: r.matchedWords, explicitPaths: explicit });
    if (c.score < MIN_RELEVANCE_SCORE.knownIssue) continue;
    candidates.set(r.file, c);
  }
  for (const r of keywordScored) {
    if (candidates.has(r.file)) continue;
    const c = scoreCandidate({ file: r.file, source: 'keyword', matchedWords: r.matchedWords, explicitPaths: explicit });
    if (c.score < MIN_RELEVANCE_SCORE.keyword) continue;
    candidates.set(r.file, c);
  }

  let ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  const whySelected = {};
  for (const c of ranked) whySelected[c.file] = { source: c.source, score: c.score, reasons: c.reasons };
  let files = ranked.map((c) => c.file);

  if (level >= 2) {
    const dirs = new Set(files.map((f) => path.posix.dirname(f)).filter((d) => d !== '.'));
    for (const d of dirs) {
      for (const f of listFilesShallow(root, d, 15)) {
        if (!(f in whySelected)) whySelected[f] = { source: 'sibling-directory', score: 1, reasons: [`in the same directory as an already-selected file at level 2 (${d})`] };
        files.push(f);
      }
    }
    files = [...new Set(files)];
  }

  const cap = LEVELS[level].maxFiles;
  if (cap) files = files.slice(0, cap);

  return { files, level, full: false, sources, whySelected };
}

module.exports = {
  compileContext, extractExplicitPaths, knownIssueFileRefs, knownIssueFileRefsScored,
  keywordSearch, keywordSearchScored, scoreCandidate, tokenize, LEVELS, MIN_RELEVANCE_SCORE,
};
