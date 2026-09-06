#!/usr/bin/env node
'use strict';

/**
 * scripts/ai-bridge-cli.js
 * CLI command tool for GitHub AI Coordination Bridge (ChatGPT ↔ Jules).
 */

const bridge = require('../lib/ai-bridge');

function printHelp() {
  console.log(`
AI Bridge CLI — ChatGPT ↔ Jules
Usage: node scripts/ai-bridge-cli.js <command> [options]

Commands:
  --enqueue-task     Enqueue a new task into .ai/bridge/tasks.jsonl
                     Options: --id <id> --task "<summary>" --priority <P0|P1|P2|P3> --criteria "<criteria>"
  --list-pending     List pending uncompleted/unclaimed tasks for Jules
  --claim-task       Claim next available task for Jules
                     Options: --agent <agent-name> (default: Jules)
  --post-result      Post result for a task
                     Options: --id <id> --status <status> --summary "<summary>" --branch "<branch>" --commit "<commit>" --pr "<pr>" --tests "<tests>"
  --recover-stale    Identify and recover abandoned/stale claimed tasks
  --sync             Synchronize and return overall bridge status
  --help             Show this help message
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    command: null,
    options: {}
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      if (['--enqueue-task', '--list-pending', '--claim-task', '--post-result', '--recover-stale', '--sync', '--help'].includes(arg)) {
        parsed.command = arg;
      } else {
        const key = arg.replace(/^--/, '');
        const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
        parsed.options[key] = val;
      }
    }
  }

  return parsed;
}

function main() {
  const { command, options } = parseArgs();

  if (!command || command === '--help') {
    printHelp();
    process.exit(0);
  }

  switch (command) {
    case '--enqueue-task': {
      const id = options.id || `task-${Date.now()}`;
      const summary = options.task || options.summary || 'Unspecified task';
      const priority = options.priority || 'P1';
      const criteria = options.criteria || null;

      const res = bridge.enqueueTask({
        id,
        summary,
        priority,
        acceptance_criteria: criteria,
        sender: options.sender || 'ChatGPT',
        recipient: options.recipient || 'Jules'
      });

      if (!res.ok) {
        console.error('Error enqueuing task:', res.error);
        process.exit(1);
      }
      console.log('Task enqueued successfully:\n');
      console.log(bridge.formatChatGptToJules(res.task));
      break;
    }

    case '--list-pending': {
      const tasks = bridge.readTasks();
      const state = bridge.readState();
      const pending = tasks.filter((t) => !state.completed_tasks.includes(t.id) && (!state.claimed_tasks[t.id] || state.claimed_tasks[t.id].status === 'pending'));

      console.log(`Pending tasks count: ${pending.length}`);
      pending.forEach((t) => {
        console.log(`\n--- [${t.priority}] ${t.id} ---`);
        console.log(`Summary: ${t.summary}`);
        if (t.acceptance_criteria) {
          console.log(`Criteria: ${JSON.stringify(t.acceptance_criteria)}`);
        }
      });
      break;
    }

    case '--claim-task': {
      const agent = options.agent || 'Jules';
      const res = bridge.claimNextTask(agent);

      if (!res.ok) {
        console.error('Error claiming task:', res.error);
        process.exit(1);
      }
      if (!res.task) {
        console.log('No pending tasks available for claim.');
      } else {
        console.log('Task claimed successfully:\n');
        console.log(bridge.formatChatGptToJules(res.task));
      }
      break;
    }

    case '--post-result': {
      if (!options.id) {
        console.error('Error: --id is required for --post-result');
        process.exit(1);
      }

      const res = bridge.postResult({
        id: options.id,
        sender: options.sender || 'Jules',
        recipient: options.recipient || 'ChatGPT',
        status: options.status || 'completed',
        summary: options.summary || options.result || 'Completed task',
        branch: options.branch || null,
        commit: options.commit || null,
        PR: options.pr || options.PR || null,
        tests: options.tests || 'Verified via automated tests',
        next_action: options.next_action || options.nextAction || 'Ready for review'
      });

      if (!res.ok) {
        console.error('Error posting result:', res.error);
        process.exit(1);
      }
      console.log('Result posted successfully:\n');
      console.log(bridge.formatJulesToChatGpt(res.result));
      break;
    }

    case '--recover-stale': {
      const res = bridge.recoverStaleTasks();
      if (!res.ok) {
        console.error('Error recovering stale tasks:', res.error);
        process.exit(1);
      }
      console.log(`Stale task recovery complete:`);
      console.log(`Recovered count: ${res.recovered.length}`);
      console.log(`Dead-lettered count: ${res.deadLettered.length}`);
      break;
    }

    case '--sync': {
      const status = bridge.syncBridge();
      console.log('AI Bridge Status Summary:\n', JSON.stringify(status, null, 2));
      break;
    }

    default:
      printHelp();
      process.exit(1);
  }
}

main();
