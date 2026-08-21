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

if (failed) {
  console.error('\nAgent rules check FAILED');
  process.exit(1);
} else {
  console.log('\nAgent rules check PASSED');
}
