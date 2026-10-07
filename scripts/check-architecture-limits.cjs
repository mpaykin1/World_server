const fs = require('fs');
const cp = require('child_process');

const LIMITS = { lines: 400, imports: 10 };
const CODE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|jsx|py|gd|java|cs|go|rs|cpp|cc|c|h|hpp)$/;
const IMPORT_RE = /^\s*(import\s|from\s+\S+\s+import\s|(?:const|let|var)\s+.*=\s*require\()/;

function metrics(text) {
  const lines = text.split(/\r?\n/);
  return {
    lines: lines.length,
    imports: lines.filter((line) => IMPORT_RE.test(line)).length,
  };
}

function regressions(current, base) {
  const problems = [];
  if (current.lines > LIMITS.lines && (!base || base.lines <= LIMITS.lines || current.lines > base.lines)) {
    problems.push(`${current.lines} lines > ${LIMITS.lines}`);
  }
  if (current.imports > LIMITS.imports && (!base || base.imports <= LIMITS.imports || current.imports > base.imports)) {
    problems.push(`${current.imports} imports > ${LIMITS.imports}`);
  }
  return problems;
}

function git(args) {
  return cp.execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function safeGit(args) {
  try {
    return git(args);
  } catch {
    return '';
  }
}

function resolveBaseRef({ env = process.env, branch, runGit = safeGit } = {}) {
  if (env.ARCHITECTURE_BASE_REF) return env.ARCHITECTURE_BASE_REF;

  const currentBranch = branch ?? runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  const branchCandidates = [];
  if (env.GITHUB_BASE_REF) branchCandidates.push(`origin/${env.GITHUB_BASE_REF}`);
  if (currentBranch && currentBranch !== 'master') branchCandidates.push('origin/master');

  for (const candidate of [...new Set(branchCandidates)]) {
    const mergeBase = runGit(['merge-base', 'HEAD', candidate]);
    if (mergeBase) return mergeBase;
  }

  return 'HEAD^';
}

function changedFiles(baseRef) {
  const files = new Set();
  for (const output of [
    safeGit(['diff', '--name-only', '--diff-filter=ACMRT', `${baseRef}..HEAD`]),
    safeGit(['diff', '--name-only', '--diff-filter=ACMRT', 'HEAD']),
    safeGit(['ls-files', '--others', '--exclude-standard']),
  ]) {
    for (const file of output.split(/\r?\n/).filter(Boolean)) files.add(file);
  }
  return [...files].filter((file) => CODE_EXTENSIONS.test(file) && fs.existsSync(file));
}

function fileAt(ref, file) {
  try {
    return cp.execFileSync('git', ['show', `${ref}:${file}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function main() {
  const baseRef = resolveBaseRef();
  const files = changedFiles(baseRef);
  const violations = [];

  for (const file of files) {
    const current = metrics(fs.readFileSync(file, 'utf8'));
    const baseText = fileAt(baseRef, file);
    const base = baseText === null ? null : metrics(baseText);
    const problems = regressions(current, base);
    if (problems.length) violations.push(`${file}: ${problems.join(', ')}`);
  }

  if (violations.length) {
    console.error('Architecture anti-regression failed:\n' + violations.join('\n'));
    process.exit(1);
  }

  console.log(`Architecture anti-regression PASS: ${files.length} changed code files checked from ${baseRef}`);
}

if (require.main === module) main();
module.exports = { LIMITS, metrics, regressions, resolveBaseRef };
