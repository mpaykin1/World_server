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

// 5. Permanent autonomous multi-AI rules must exist in AGENTS.md
try {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  check(/AUTONOMOUS AI TEAM/i.test(agents), 'AGENTS.md contains AUTONOMOUS AI TEAM');
  check(/MULTI-AI PEER IMPROVEMENT/i.test(agents), 'AGENTS.md contains MULTI-AI PEER IMPROVEMENT');
  check(/SESSION CONTINUITY/i.test(agents), 'AGENTS.md contains SESSION CONTINUITY');
  check(/open-source auto-install/i.test(agents), 'AGENTS.md contains open-source auto-install');
  check(/regression protection/i.test(agents), 'AGENTS.md contains regression protection');
  check(/safe AI isolation|Isolation AI/i.test(agents), 'AGENTS.md contains safe AI isolation');
} catch (e) {
  console.error('WARN: AGENTS.md content check failed', e.message);
  check(false, 'AGENTS.md permanent rules check');
}

// 6. WORK_IN_PROGRESS continuity protocol
try {
  const wipPath = path.join(root, 'WORK_IN_PROGRESS.md');
  check(fs.existsSync(wipPath), 'WORK_IN_PROGRESS.md exists');
  if (fs.existsSync(wipPath)) {
    const wip = fs.readFileSync(wipPath, 'utf8');
    const required = ['Current State', 'Target State', 'Progress', 'Branch', 'Commit', 'Tests', 'Blockers', 'Next Action', 'Completion Criteria'];
    for (const sec of required) {
      check(new RegExp(`^##\\s+${sec}`, 'mi').test(wip) || new RegExp(sec, 'i').test(wip), `WORK_IN_PROGRESS contains ${sec}`);
    }
  }
} catch (e) {
  console.error('WARN: WORK_IN_PROGRESS check failed', e.message);
}

// 7. Multi-AI peer review gate exists and is runnable
try {
  const gatePath = path.join(root, 'scripts/multi-ai-peer-review.cjs');
  check(fs.existsSync(gatePath), 'scripts/multi-ai-peer-review.cjs exists');
  if (fs.existsSync(gatePath)) {
    const r = require('child_process').spawnSync(process.execPath, [gatePath], { encoding: 'utf8', cwd: root, timeout: 15000 });
    check(r.status === 0, 'multi-ai-peer-review gate runnable');
  }
} catch (e) {
  console.error('WARN: peer review gate check failed', e.message);
}

// 8. AI commit provenance — WARN (non-blocking) if two independent active
// AI sessions (different branches, both touched recently) claim the same
// AI-Session/Claude-Session id. See AGENTS.md "AI COMMIT PROVENANCE".
try {
  const { auditActiveSessionProvenance } = require('./lib/ai-commit-provenance.cjs');
  const { collisions } = auditActiveSessionProvenance({ cwd: root });
  if (collisions.length) {
    for (const c of collisions) {
      const branches = [...new Set(c.records.map((r) => r.branch))].join(', ');
      console.error(`WARN: AI-Session provenance collision — session "${c.sessionId}" claimed by tip commits on multiple active branches (${branches}). Reusing an AI-Session id across independent active sessions is a provenance violation (AGENTS.md "AI COMMIT PROVENANCE") — investigate before merging either branch. This does not fail the gate.`);
    }
  } else {
    console.log('OK: no duplicate AI-Session id across active branches (provenance check)');
  }
} catch (e) {
  console.error('WARN: AI commit provenance check failed to run:', e.message);
}

if (failed) {
  console.error('\nAgent rules check FAILED');
  process.exit(1);
} else {
  console.log('\nAgent rules check PASSED');
}
