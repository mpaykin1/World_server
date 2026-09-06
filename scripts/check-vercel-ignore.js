#!/usr/bin/env node

/**
 * Path-aware Vercel deployment ignore script.
 *
 * Exit code behavior for Vercel ignoreCommand:
 * - Exit code 0: Skip / cancel the build (no runtime/production code affected).
 * - Exit code 1: Proceed with the build (production/runtime/API/app/config code affected).
 */

const { execSync } = require('child_process');
const path = require('path');

const NON_DEPLOYABLE_PREFIXES = [
  '.ai/',
  '.github/',
  'docs/',
  'test/',
  'e2e/',
  'godot/',
  'policy/',
  'templates/'
];

const NON_DEPLOYABLE_EXTENSIONS = [
  '.md',
  '.txt'
];

const NON_DEPLOYABLE_EXACT_FILES = new Set([
  '.gitignore',
  '.env.example',
  'ai3d-final-delivery.json',
  '.collective-brain-install.json'
]);

const NON_DEPLOYABLE_ROOT_PATTERNS = [
  /^QUALITY_.*\.json$/,
  /^COLLECTIVE_BRAIN_.*\.json$/,
  /^OPENHUMAN_.*\.json$/,
  /^ANYTHINGLLM_.*\.json$/,
  /^WORLD_.*\.json$/,
  /^TECHNOLOGY_.*\.json$/,
  /^AI_VISUAL_CRITIC_REPORT\.json$/,
  /^EVIDENCE_QUALITY_REPORT\.json$/,
  /^OLLAMA_MODEL_BENCHMARK\.json$/,
  /^PROJECT_QUALITY_REVIEW\.json$/,
  /^SYSTEM_CONTRACT_REPORT\.json$/,
  /^TEST_GAP_MANIFEST\.json$/,
  /^VISUAL_PERCEPTUAL_REPORT\.json$/,
  /^DUPLICATE_SYSTEM_REPORT\.json$/
];

function isDeployableFile(filepath) {
  if (!filepath) return false;
  const normalized = filepath.replace(/\\/g, '/').trim();
  if (!normalized) return false;

  // Check prefixes
  for (const prefix of NON_DEPLOYABLE_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return false;
    }
  }

  // Check exact files
  if (NON_DEPLOYABLE_EXACT_FILES.has(normalized)) {
    return false;
  }

  // Check extensions
  const ext = path.extname(normalized).toLowerCase();
  if (NON_DEPLOYABLE_EXTENSIONS.includes(ext)) {
    return false;
  }

  // Check root JSON quality/report patterns
  if (!normalized.includes('/')) {
    for (const pattern of NON_DEPLOYABLE_ROOT_PATTERNS) {
      if (pattern.test(normalized)) {
        return false;
      }
    }
  }

  // Any other file is considered deployable
  return true;
}

function getChangedFiles() {
  // If files passed via command line arguments, use them (useful for testing/manual runs)
  const args = process.argv.slice(2);
  if (args.length > 0) {
    return args;
  }

  const prevSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA;

  let cmd = '';
  if (prevSha && commitSha) {
    cmd = `git diff --name-only ${prevSha} ${commitSha}`;
  } else {
    cmd = 'git diff --name-only HEAD^ HEAD';
  }

  try {
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
  } catch {
    try {
      const fallbackOutput = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return fallbackOutput.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
    } catch {
      // If git diff fails (e.g. no git history or shallow clone), return null to trigger safe build
      return null;
    }
  }
}

function main() {
  const changedFiles = getChangedFiles();

  if (!changedFiles || changedFiles.length === 0) {
    // Fail-safe: if changed files cannot be determined, proceed with build
    console.log('[Vercel Quota Guard] Unable to determine diff or empty diff; proceeding with build.');
    process.exit(1);
  }

  const deployableFiles = changedFiles.filter(isDeployableFile);

  if (deployableFiles.length > 0) {
    console.log(`[Vercel Quota Guard] Build required. Deployable files changed (${deployableFiles.length}):`);
    deployableFiles.slice(0, 10).forEach((f) => console.log(`  - ${f}`));
    if (deployableFiles.length > 10) {
      console.log(`  ... and ${deployableFiles.length - 10} more.`);
    }
    process.exit(1);
  } else {
    console.log(`[Vercel Quota Guard] Skipping build. All changed files (${changedFiles.length}) are non-deployable/docs/test/AI-bridge changes.`);
    process.exit(0);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isDeployableFile,
  getChangedFiles
};
