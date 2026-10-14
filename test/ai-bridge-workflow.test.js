'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseCommentTask } = require('../lib/ai-bridge');

test('workflow file syntax check', () => {
  const ingressPath = path.resolve(__dirname, '../.github/workflows/ai-bridge-ingress.yml');
  assert.ok(fs.existsSync(ingressPath), 'Ingress workflow file exists');

  const content = fs.readFileSync(ingressPath, 'utf8');
  assert.match(content, /name: AI Bridge Zero-Secret GitHub Ingress/);
  assert.match(content, /on:\s*\r?\n\s*issue_comment:/);
  assert.match(content, /contains\(github\.event\.comment\.body, '\[AI-BRIDGE TASK\]'\)/);
  assert.match(content, /process\.env\.GITHUB_WORKSPACE/);
  assert.match(content, /listForRepo/); // Idempotency check present
});

test('parseCommentTask idempotency and tag generation', () => {
  const commentBody = `[AI-BRIDGE TASK]
task_id: task_workflow_spec_1
priority: high
task: Fix workflow syntax and ensure zero secret leakage.
acceptance_criteria: Workflow executes cleanly.`;

  const parsed = parseCommentTask(commentBody, 999111);
  assert.equal(parsed.taskId, 'task_workflow_spec_1');
  assert.equal(parsed.priority, 'high');
  assert.ok(parsed.task.includes('Fix workflow syntax'));
});

// Runs the workflow's real github-script body against a mocked client: one child issue per
// comment, and a second delivery of the same comment is recognized as a duplicate. Before the
// fix the body wrote "**Task ID:** x", which never contains the "Task ID: x" the check looks for.
test('ingress script creates one child issue and skips a redelivered comment', async () => {
  const yaml = require('js-yaml');
  const root = path.resolve(__dirname, '..');
  const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ai-bridge-ingress.yml'), 'utf8'), { schema: yaml.CORE_SCHEMA });
  const step = workflow.jobs['process-comment-ingress'].steps.find((s) => s.with && s.with.script);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const script = new AsyncFunction('github', 'context', 'require', 'process', 'console', step.with.script);
  const quiet = { log() {}, warn() {} };
  const comment = { id: 4242, body: '[AI-BRIDGE TASK]\ntask_id: task_ingress_sim\npriority: high\ntask: First line\nacceptance_criteria: Done.' };
  const issue = { number: 55, title: 'AI Bridge — ChatGPT ↔ Jules', labels: [{ name: 'ai-bridge' }] };
  async function deliver(existing) {
    const created = [];
    const github = { rest: { issues: {
      listForRepo: async () => ({ data: existing }),
      create: async (o) => { created.push(o); return { data: { number: 900 + created.length } }; },
      createComment: async () => ({}),
    } } };
    const context = { repo: { owner: 'o', repo: 'r' }, payload: { comment, issue } };
    await script(github, context, require, { env: { GITHUB_WORKSPACE: root } }, quiet);
    return created;
  }
  const first = await deliver([]);
  assert.equal(first.length, 1);
  assert.match(first[0].body, /Task ID: task_ingress_sim/);
  assert.match(first[0].body, /Origin Comment ID: 4242/);
  assert.match(first[0].body, /#### Task Description\nFirst line/);
  const again = await deliver([{ number: 901, body: first[0].body }]);
  assert.equal(again.length, 0, 'redelivered comment must not create a second child issue');
});
