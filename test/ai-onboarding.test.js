const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const requiredFiles = [
  'AI_START_HERE.md',
  'AGENTS.md',
  '.ai/project-context-index.json',
  '.ai/connection-manifest.json',
  '.ai/bridge/README.md',
  'docs/AI_ONBOARDING_AND_CONNECTIONS.md',
  'NEW_AI_BOOTSTRAP_PROMPT.md'
];

test('universal AI onboarding canonical files exist', () => {
  for (const file of requiredFiles) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `missing ${file}`);
  }
});

test('connection manifest declares GitHub and canonical AI Bridge as required bootstrap capabilities', () => {
  const manifest = JSON.parse(read('.ai/connection-manifest.json'));
  assert.equal(manifest.bootstrap.startHere, 'AI_START_HERE.md');
  assert.equal(manifest.bootstrap.canonicalBridgeIssue, 55);
  assert.equal(manifest.rules.neverCopySessionTokens, true);
  assert.equal(manifest.rules.neverCommitSecrets, true);
  assert.equal(manifest.rules.doNotClaimInheritedAccess, true);

  const byId = new Map(manifest.connections.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('github')?.priority, 'required');
  assert.equal(byId.get('world_server_ai_bridge')?.priority, 'required');
  assert.equal(byId.get('world_server_ai_bridge')?.auth, 'inherits_github_repo_access');
});

test('project context index discovers onboarding and bridge files', () => {
  const index = JSON.parse(read('.ai/project-context-index.json'));
  for (const file of [
    '.ai/connection-manifest.json',
    'docs/AI_ONBOARDING_AND_CONNECTIONS.md',
    '.ai/bridge/README.md',
    'NEW_AI_BOOTSTRAP_PROMPT.md'
  ]) {
    assert.equal(index.canonicalContextFiles.includes(file), true, `index missing ${file}`);
  }
});

test('human bootstrap docs require capability verification and zero-secret onboarding', () => {
  const start = read('AI_START_HERE.md');
  const onboarding = read('docs/AI_ONBOARDING_AND_CONNECTIONS.md');
  const bootstrap = read('NEW_AI_BOOTSTRAP_PROMPT.md');
  const bridge = read('.ai/bridge/README.md');

  assert.match(start, /\.ai\/connection-manifest\.json/);
  assert.match(start, /\.ai\/bridge\/README\.md/);
  assert.match(onboarding, /Connections are portable; credentials are not\./);
  assert.match(onboarding, /AI-BRIDGE HELLO/);
  assert.match(bootstrap, /Never claim that you inherited connections from another ChatGPT\/account/);
  assert.match(bridge, /single canonical, cloud-first AI coordination bridge/i);
});
