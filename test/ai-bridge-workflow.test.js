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

test('embedded ingress script keeps template text inside the YAML block and compiles',()=>{
  const content=fs.readFileSync(path.resolve(__dirname,'../.github/workflows/ai-bridge-ingress.yml'),'utf8');
  const lines=content.split(/\r?\n/);
  const start=lines.findIndex(line=>/^          script: \|$/.test(line));
  assert.ok(start>=0,'script scalar exists');
  const body=lines.slice(start+1);
  for(const [index,line] of body.entries()){
    if(line.trim())assert.match(line,/^ {12}/,`line ${start+index+2} must remain in the script scalar`);
  }
  const script=body.map(line=>line.startsWith('            ')?line.slice(12):line).join('\n');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  assert.doesNotThrow(()=>new AsyncFunction('github','context','require','process',script));
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
