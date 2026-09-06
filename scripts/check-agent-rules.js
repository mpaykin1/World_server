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


// 5. Every executable AI entrypoint inherits the shared zero-chaos lifecycle policy.
try {
  const desktopPolicy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'desktop-ai-policy.json'), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'collective-brain', 'agent-capabilities.json'), 'utf8'));
  const hygiene = desktopPolicy.sessionHygiene || {};
  const sessionPolicy = registry.sessionPolicy || {};
  check(hygiene.requiredForEveryAgent === true, 'Session hygiene is mandatory for every agent');
  check(hygiene.inheritForFutureAgents === true && sessionPolicy.inheritByDefault === true, 'Future agent entries inherit session hygiene by default');
  check(!/[\\/]Desktop[\\/]/i.test(String(hygiene.worktreesRoot || '')), 'Configured AI worktree root is never Desktop');
  check(!/[\\/]Desktop[\\/]/i.test(String(hygiene.scratchRoot || '')), 'Configured AI scratch root is never Desktop');

  const covered = new Set([...(sessionPolicy.runtimeEnforced || []), ...(sessionPolicy.contractEnforced || [])]);
  const missing = Object.keys(registry.agents || {}).filter((id) => !covered.has(id));
  check(missing.length === 0, `Every registered agent has session-policy coverage (missing: ${missing.join(', ') || 'none'})`);

  const coordinatorSource = fs.readFileSync(path.join(root, 'scripts', 'master-coordinator.cjs'), 'utf8');
  const adapterSource = fs.readFileSync(path.join(root, 'lib', 'agent-adapters.js'), 'utf8');
  const newTaskSource = fs.readFileSync(path.join(root, 'scripts', 'desktop-ai-new-task.js'), 'utf8');
  check(coordinatorSource.includes("require('../lib/agent-session-guard')") && coordinatorSource.includes('withAgentSessionGuard('), 'Master coordinator wraps executable dispatch in shared session guard');
  check(adapterSource.includes("require('./agent-session-guard')") && adapterSource.includes('implementGoalGuarded'), 'Direct agent adapter path is wrapped by shared session guard');
  check(!adapterSource.includes("path.join(os.tmpdir(), 'world-server-agent-worktrees')"), 'Agent worktrees cannot regress to generic OS temp');
  check(newTaskSource.includes("require('../lib/agent-session-guard')") && newTaskSource.includes("preflight('desktop-ai'"), 'Direct Desktop AI task startup runs zero-chaos preflight');

  for (const rel of ['scripts/master-coordinator.cjs', 'scripts/desktop-ai-new-task.js']) {
    const bytes = fs.readFileSync(path.join(root, rel));
    check(!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf), `${rel} has no UTF-8 BOM before shebang`);
  }
} catch (e) {
  console.error('WARN: session hygiene policy check failed', e.message);
  failed = true;
}


// 6. Consequential manual-action / deployment confidence gate.
try {
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'data', 'deployment-safety-policy.json'), 'utf8'));
  const evidence = policy.evidenceRequirements || {};
  const deployment = policy.deploymentRules || {};
  const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');

  check(Number(policy.manualActionConfidenceThreshold) >= 0.95, 'Manual-action confidence threshold is at least 95%');
  check(Number(evidence.minimumIndependentSources) >= 2, 'Consequential user instructions require at least two independent evidence sources');
  check(evidence.requireAuthoritativeSourceForExternalPlatform === true, 'External-platform actions require authoritative current evidence');
  check(evidence.requireTargetIdentityProof === true && evidence.requireCurrentStateProbe === true, 'Exact target identity and current state must be proven before user action');
  check(evidence.distinguishRepositoryIntegratedFromLiveDeployed === true, 'Repository integration and live deployment are separate states');
  check(deployment.neverClaimInstalledWithoutLiveEvidence === true, 'Production install claims require live runtime evidence');
  check(deployment.preferExistingPublishedAppUpdateInPlace === true, 'Existing published production defaults to update-in-place');
  check(deployment.neverDeleteOrUnpublishExistingProductionToUpdate === true, 'Existing production cannot be deleted/unpublished merely to update it');
  check(deployment.neverCreateDuplicateProjectAppOrServiceWhenTargetExists === true, 'Duplicate deployment targets are forbidden when the target exists');
  check(deployment.neverForcePushStaleAiStudioWorkspaceIntoCanonicalMaster === true, 'Stale/uncertain AI Studio workspaces cannot force-push canonical master');
  check(deployment.aiStudioStarterTierOverwriteExistingSlot === true, 'AI Studio Starter Tier updates overwrite the existing app slot');
  check(policy.belowThresholdAction === 'continue_investigation_do_not_instruct_user', 'Below 95% confidence means investigate, not instruct the user');
  check(Array.isArray(policy.destructiveExceptionRequires) && policy.destructiveExceptionRequires.length >= 3, 'Destructive deployment exceptions require evidence, rollback/URL preservation, and explicit approval');
  check(agentsMd.includes('MANUAL-ACTION & DEPLOYMENT CONFIDENCE GATE'), 'AGENTS.md contains the hard 95% deployment/manual-action gate');
  check(agentsMd.includes('https://world-server.ai.studio'), 'AGENTS.md preserves the canonical production target');
} catch (e) {
  console.error('FAIL: deployment/manual-action confidence policy is unreadable or incomplete', e.message);
  failed = true;
}

if (failed) {
  console.error('\nAgent rules check FAILED');
  process.exit(1);
} else {
  console.log('\nAgent rules check PASSED');
}
