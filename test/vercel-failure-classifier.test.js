'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyVercelStatus,
  isVercelContext,
  projectFromContext,
  githubOutput,
} = require('../.github/scripts/vercel-failure-classifier.cjs');

test('recognizes Vercel status contexts and project names', () => {
  assert.equal(isVercelContext('Vercel – world-server'), true);
  assert.equal(isVercelContext('Vercel - world-server'), true);
  assert.equal(isVercelContext('CI'), false);
  assert.equal(projectFromContext('Vercel – world-server'), 'world-server');
});

test('rate limit is external and never dispatched for code repair', () => {
  const result = classifyVercelStatus({
    state: 'failure',
    context: 'Vercel – world-server',
    description: 'Deployment rate limited — retry in 24 hours.',
  });
  assert.equal(result.kind, 'external-limit');
  assert.equal(result.shouldRepair, false);
});

test('quota failure is external and never dispatched for code repair', () => {
  const result = classifyVercelStatus({
    state: 'failure',
    context: 'Vercel – world-server',
    description: 'Build quota exceeded for this team.',
  });
  assert.equal(result.kind, 'external-limit');
  assert.equal(result.shouldRepair, false);
});

test('generic failed Vercel build is repairable', () => {
  const result = classifyVercelStatus({
    state: 'failure',
    context: 'Vercel – world-server',
    description: 'Deployment has failed — inspect build logs.',
    targetUrl: 'https://vercel.com/improve-world/world-server/example',
  });
  assert.equal(result.kind, 'build-failure');
  assert.equal(result.shouldRepair, true);
  assert.equal(result.project, 'world-server');
});

test('cancelled deployment is not a coding task', () => {
  const result = classifyVercelStatus({
    state: 'failure',
    context: 'Vercel – world-server',
    description: 'Deployment canceled by a newer deployment.',
  });
  assert.equal(result.kind, 'non-repairable');
  assert.equal(result.shouldRepair, false);
});

test('unrelated status is ignored even when failed', () => {
  const result = classifyVercelStatus({
    state: 'failure',
    context: 'CI',
    description: 'tests failed',
  });
  assert.equal(result.relevant, false);
  assert.equal(result.shouldRepair, false);
});

test('successful Vercel status is ignored', () => {
  const result = classifyVercelStatus({
    state: 'success',
    context: 'Vercel – world-server',
    description: 'Deployment ready',
  });
  assert.equal(result.relevant, false);
  assert.equal(result.kind, 'ignore');
});

test('GitHub output format contains stable bounded keys', () => {
  const output = githubOutput(classifyVercelStatus({
    state: 'failure',
    context: 'Vercel – world-server',
    description: 'Deployment has failed',
  }));
  assert.match(output, /^relevant=true/m);
  assert.match(output, /^should_repair=true/m);
  assert.match(output, /^kind=build-failure/m);
  assert.doesNotMatch(output, /\r/);
});

test('workflow prioritizes current master SHA before preview branch metadata', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'vercel-repair-agent.yml'), 'utf8');
  const defaultShaCheck = source.indexOf('DEFAULT_SHA="$(gh api');
  const previewBranchRead = source.indexOf("BRANCH=\"$(jq -r '.branches[0].name // empty'");
  assert.ok(defaultShaCheck >= 0, 'default branch SHA check must exist');
  assert.ok(previewBranchRead >= 0, 'preview branch metadata read must exist');
  assert.ok(defaultShaCheck < previewBranchRead, 'master SHA must be checked before preview branch metadata');
  assert.match(source, /FAILED_SHA.*DEFAULT_SHA/);
});
