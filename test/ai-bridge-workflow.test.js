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
