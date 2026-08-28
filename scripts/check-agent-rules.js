'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let failed = false;

function check(condition, msg) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    failed = true;
  } else {
    console.log(`OK: ${msg}`);
  }
}

// 1. AGENTS.md exists
check(fs.existsSync(path.join(root, 'AGENTS.md')), 'AGENTS.md exists in repo root');

// 2. No tracked .env files (except .env.example)
try {
  const tracked = execSync('git ls-files', { encoding: 'utf8', cwd: root });
  const envFiles = tracked.split('\n').filter(f => /^\.env(\.|$)/.test(f) && f !== '.env.example');
  check(envFiles.length === 0, `.env not tracked (found: ${envFiles.join(', ') || 'none'})`);
} catch (e) {
  console.error('WARN: git ls-files failed', e.message);
}

// 3. No hardcoded SUPABASE_SECRET_KEY assignments outside allowlist (cross-platform, no grep)
try {
  const allowlist = ['.env.example', 'AGENTS.md', '.github', 'check-agent-rules.js'];
  const pattern = /SUPABASE_SECRET_KEY\s*=/;
  const hits = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(js|json|ts|md)$/.test(entry.name)) {
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (allowlist.some(a => rel.includes(a))) continue;
        const content = fs.readFileSync(full, 'utf8');
        if (pattern.test(content)) hits.push(rel);
      }
    }
  }
  walk(root);
  check(hits.length === 0, 'No hardcoded SUPABASE_SECRET_KEY in code' + (hits.length ? ` (found in: ${hits.join(', ')})` : ''));
} catch (e) {
  console.error('WARN: secret scan failed', e.message);
}

// 4. Branch name convention hint
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: root }).trim();
  const ok = branch === 'master' || /^(ai\/[^/]+\/.+|opencode\/.+)/.test(branch);
  check(ok, `Branch name convention (current: ${branch}) — expect ai/<agent>/<task> or opencode/<task> or master`);
} catch (e) {
  console.error('WARN: branch check failed', e.message);
}

// 5. AGENTS.md carries the required standing-policy concepts (not their exact
// wording — that's free to evolve — just that the concept hasn't been quietly
// dropped by an edit). Each one maps to a real AGENTS.md section.
try {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  const requiredConcepts = [
    { label: 'multi-agent / peer improvement', pattern: /multi-ai peer improvement/i },
    { label: 'session continuity', pattern: /session continuity/i },
    { label: 'autonomous technical execution', pattern: /autonomous technical execution/i },
    { label: 'OSS auto-install policy', pattern: /installed by the agent directly|self-install free oss/i },
    { label: 'regression protection requirement', pattern: /regression protection/i },
    { label: 'safe AI isolation (no touching another agent\'s worktree/watchdog)', pattern: /another agent's checked-out worktree/i },
    { label: 'API-surface router-reuse / Vercel function budget policy', pattern: /before adding new api surface/i },
    { label: 'dual-layer fallback+AI policy (never choose one over the other)', pattern: /never choose between a free deterministic fallback and real runtime\/ai integration/i }
  ];
  const missing = requiredConcepts.filter(c => !c.pattern.test(agents)).map(c => c.label);
  check(missing.length === 0, 'AGENTS.md contains all required standing-policy concepts' + (missing.length ? ` (missing: ${missing.join(', ')})` : ''));
} catch (e) {
  console.error('WARN: AGENTS.md policy-concept check failed', e.message);
}

// 6. WORK_IN_PROGRESS.md exists and has the required continuity structure.
// Only checks the structure (section headers), never hardcodes today's
// actual task/branch/commit values — those change with every real update.
try {
  const wipPath = path.join(root, 'WORK_IN_PROGRESS.md');
  check(fs.existsSync(wipPath), 'WORK_IN_PROGRESS.md exists in repo root');
  if (fs.existsSync(wipPath)) {
    const wip = fs.readFileSync(wipPath, 'utf8');
    const requiredSections = ['Current State', 'Target State', 'Branch', 'Commit', 'Tests', 'Blockers', 'Next Action', 'Completion Criteria'];
    const missingSections = requiredSections.filter(s => !new RegExp(s.replace(/\s+/g, '\\s+'), 'i').test(wip));
    check(missingSections.length === 0, 'WORK_IN_PROGRESS.md has the required continuity sections' + (missingSections.length ? ` (missing: ${missingSections.join(', ')})` : ''));
  }
} catch (e) {
  console.error('WARN: WORK_IN_PROGRESS.md structure check failed', e.message);
}

if (failed) {
  console.error('\nAgent rules check FAILED');
  process.exit(1);
} else {
  console.log('\nAgent rules check PASSED');
}
