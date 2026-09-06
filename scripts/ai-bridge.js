#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  ensureBridgeDir,
  enqueueTask,
  claimNextTask,
  completeTask,
  readJsonl,
  readState,
  recoverStaleTasks,
  getPaths
} = require('../lib/ai-bridge');

function printUsage() {
  console.log(`
Usage: node scripts/ai-bridge.js <command> [options]

Commands:
  enqueue --task "<summary>" [--sender ChatGPT] [--recipient Jules] [--priority normal] [--id <id>]
  claim [--worker Jules]
  complete --task-id <id> [--summary "<summary>"] [--status completed] [--branch <branch>] [--commit <commit>] [--pr <pr>] [--tests "<tests>"]
  status
  recover
  validate
`);
}

function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const flags = parseArgs(args.slice(1));

  ensureBridgeDir();

  switch (command) {
    case 'enqueue': {
      const summary = flags.task || flags.summary;
      if (!summary) {
        console.error('Error: --task or --summary is required');
        process.exit(1);
      }
      const res = enqueueTask(undefined, {
        id: flags.id,
        sender: flags.sender || 'ChatGPT',
        recipient: flags.recipient || 'Jules',
        priority: flags.priority || 'normal',
        summary,
        branch: flags.branch || null,
        commit: flags.commit || null,
        PR: flags.pr || null,
        tests: flags.tests || 'pending',
        blockers: [],
        next_action: 'awaiting_claim'
      });
      console.log('Task enqueued:', JSON.stringify(res, null, 2));
      break;
    }

    case 'claim': {
      const worker = flags.worker || 'Jules';
      const res = claimNextTask(undefined, worker);
      console.log('Claim result:', JSON.stringify(res, null, 2));
      break;
    }

    case 'complete': {
      const taskId = flags['task-id'] || flags.taskId || flags.id;
      if (!taskId) {
        console.error('Error: --task-id is required');
        process.exit(1);
      }
      const res = completeTask(undefined, taskId, {
        sender: flags.sender || 'Jules',
        recipient: flags.recipient || 'ChatGPT',
        status: flags.status || 'completed',
        summary: flags.summary || `Completed ${taskId}`,
        branch: flags.branch || null,
        commit: flags.commit || null,
        PR: flags.pr || null,
        tests: flags.tests || 'passed',
        blockers: [],
        next_action: flags['next-action'] || 'review'
      });
      console.log('Task completed:', JSON.stringify(res, null, 2));
      break;
    }

    case 'status': {
      const paths = getPaths();
      const state = readState();
      const tasks = readJsonl(paths.tasksPath);
      const results = readJsonl(paths.resultsPath);
      console.log('Bridge Status:');
      console.log(JSON.stringify({ state, taskCount: tasks.length, resultCount: results.length }, null, 2));
      break;
    }

    case 'recover': {
      const reclaimed = recoverStaleTasks();
      console.log('Reclaimed stale tasks:', reclaimed);
      break;
    }

    case 'validate': {
      const reclaimed = recoverStaleTasks();
      const paths = getPaths();
      const tasks = readJsonl(paths.tasksPath);
      const results = readJsonl(paths.resultsPath);
      console.log(`Validated bridge: ${tasks.length} tasks, ${results.length} results/events readable. Reclaimed ${reclaimed.length} stale tasks.`);
      break;
    }

    default:
      printUsage();
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal bridge error:', err);
    process.exit(1);
  });
}
