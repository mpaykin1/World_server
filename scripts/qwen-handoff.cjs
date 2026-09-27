#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');

const CONTEXT_FILES = Object.freeze([
  'AI_START_HERE.md', '.ai/project-context-index.json',
  'CHATGPT_GAME_CONTROL.md', 'AGENTS.md', 'WORK_IN_PROGRESS.md',
  'QWEN.md', 'docs/AI_QWEN_COLLABORATION.md',
]);

function makeHandoff({ task, sha, branch, model = 'resolve-at-runtime' }) {
  if (typeof task !== 'string' || !task.trim() || task.length > 6000 || task.includes('\0')) {
    throw new Error('Task must contain 1..6000 characters and no NUL bytes');
  }
  if (!/^[a-f0-9]{40}$/i.test(String(sha))) throw new Error('Invalid base commit SHA');
  if (typeof branch !== 'string' || !branch || branch.length > 200 || /[\r\n]/.test(branch)) {
    throw new Error('Invalid branch');
  }
  return {
    protocol: 'WORLD_AI_HANDOFF_V1',
    repository: 'mpaykin1/World_server',
    baseSha: sha.toLowerCase(), branch, requestedAgent: 'Qwen preferred',
    actualModel: model, task: task.trim(), contextFiles: [...CONTEXT_FILES],
    acceptance: [
      'No duplicate engine, parallel feature owner, or sixth scheduled automation',
      'Reproduce defects and add focused regression tests for behavior changes',
      'Preserve current master contracts and unrelated dirty worktrees',
      'Report exact head SHA, actual model, test commands and results',
      'No verified-player-visible or release claims without browser/device evidence',
    ],
  };
}

function formatHandoff(h) {
  return [
    `=== ${h.protocol} ===`,
    `REPOSITORY: ${h.repository}`,
    `BASE_SHA: ${h.baseSha}`,
    `BRANCH: ${h.branch}`,
    `REQUESTED_AGENT: ${h.requestedAgent}`,
    `MODEL: ${h.actualModel}`,
    `CONTEXT_FILES:\n${h.contextFiles.map((file) => `- ${file}`).join('\n')}`,
    `TASK:\n${h.task}`,
    `ACCEPTANCE:\n${h.acceptance.map((rule) => `- ${rule}`).join('\n')}`,
    'RETURN: WORLD_AI_RESULT_V1 with PR, exact SHA, actual model, tests, blockers and next action.',
    '=== END_HANDOFF ===',
    '',
  ].join('\n');
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function git(args) {
  const result = cp.spawnSync('git', args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`Git failed: ${args[0]}`);
  return result.stdout.trim();
}

function main(argv = process.argv.slice(2)) {
  const taskFile = argValue(argv, '--task-file');
  if (!taskFile) throw new Error('Usage: qwen-handoff.cjs --task-file FILE [--model MODEL]');
  const task = fs.readFileSync(path.resolve(taskFile), 'utf8');
  const handoff = makeHandoff({
    task, sha: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    model: argValue(argv, '--model') || 'resolve-at-runtime',
  });
  process.stdout.write(formatHandoff(handoff));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 2; }
}

module.exports = { CONTEXT_FILES, makeHandoff, formatHandoff };
