#!/usr/bin/env node
'use strict';
// OPENHUMAN_SUBTASK
//
// The "OpenHuman as a real worker/reviewer in the existing Multi-AI contour"
// integration point (coordinator -> suitability/resource check -> OpenHuman
// subtask -> result -> review/comparison -> checked diff): any AI agent
// (Claude, another Claude session, a future orchestrator) can call
// runSubtask() to hand OpenHuman/AnythingLLM a real World_server task, get a
// structured result back, and have that result automatically appended to the
// existing state/ai-agent-reports.jsonl shared coordination log using the
// SAME schema other agents in this project already write - not a new,
// competing coordination channel.
//
// This is a thin orchestration wrapper around scripts/anythingllm-task-
// router.cjs (which already does resource-aware dispatch, model selection,
// cost-aware tool ordering, and queueing) - it adds only the "report to the
// shared pipeline" step plus a stable, addressable entry point for other
// callers who should not need to know the router's internal API.
const fs = require('fs');
const path = require('path');
const { runTask } = require('./anythingllm-task-router.cjs');
const { route } = require('../lib/mcp-intent-router');

const MAIN_TREE_ROOT = process.env.WORLD_SERVER_MAIN_TREE || 'C:\\Users\\user\\Desktop\\World_server';
const REPORT_LOG_PATH = process.env.AI_AGENT_REPORTS_PATH || path.join(MAIN_TREE_ROOT, 'state', 'ai-agent-reports.jsonl');

function appendReport(entry, reportLogPath = REPORT_LOG_PATH) {
  try {
    fs.mkdirSync(path.dirname(reportLogPath), { recursive: true });
    fs.appendFileSync(reportLogPath, JSON.stringify(entry) + '\n');
    return true;
  } catch (e) {
    // Reporting failure must never mask the actual subtask result - the
    // caller still gets a real answer even if the shared log write failed.
    return false;
  }
}

// buildReportEntry(): pure function extracted for testability - constructs the
// state/ai-agent-reports.jsonl entry from a runTask() result, using the SAME
// schema (at/agent/task_id/status/progress/branch/worktree/commit/pr/tests/
// blockers/merge_safe/next_action/findings/reusable_improvements) other AI
// agents in this project already write, rather than inventing a new shape.
function buildReportEntry(result, capabilityClass, opts = {}) {
  return {
    at: new Date().toISOString(),
    agent: 'openhuman-anythingllm',
    task_id: opts.taskId || `openhuman-subtask-${Date.now()}`,
    status: result.result === 'PASS' ? 'done' : result.result === 'QUEUED' ? 'queued' : 'failed',
    progress: result.result === 'PASS' ? 100 : result.result === 'QUEUED' ? 0 : 50,
    branch: null,
    worktree: null,
    commit: null,
    pr: null,
    tests: {},
    blockers: result.result === 'PASS' ? [] : [{ id: `subtask-${result.result.toLowerCase()}`, status: result.result === 'QUEUED' ? 'deferred_by_resource_gate' : 'needs_review', reason: result.resourceGate ? result.resourceGate.reason : (result.attempts && result.attempts[0] && (result.attempts[0].reason || 'mismatch')) || result.result }],
    merge_safe: false,
    next_action: opts.callerAgent ? `${opts.callerAgent} to review this subtask result` : 'awaiting review',
    findings: { capabilityClass, model: result.model || null, requestedBy: opts.callerAgent || 'unknown' },
    reusable_improvements: [],
  };
}

// runSubtask(): the coordinator-facing entry point. `taskText` is the real
// World_server task; `opts.callerAgent` identifies who's asking (for the
// shared report log, e.g. "claude-orchestrator"); `opts.threadSlug`/
// `opts.workspaceSlug` are required (same as runTask - a fresh thread per
// subtask keeps results uncontaminated by prior turns' history).
async function runSubtask(taskText, opts = {}) {
  if (!opts.threadSlug) throw new Error('runSubtask requires opts.threadSlug');
  const { capabilityClass } = route(taskText);
  const startedAt = new Date().toISOString();
  const start = Date.now();

  const result = await runTask(taskText, opts);
  const durationMs = Date.now() - start;

  const reported = appendReport(buildReportEntry(result, capabilityClass, { taskId: `openhuman-subtask-${start}`, callerAgent: opts.callerAgent }), opts.reportLogPath);

  return { ...result, capabilityClass, startedAt, durationMs, reportedToSharedPipeline: reported };
}

module.exports = { runSubtask, buildReportEntry, appendReport, REPORT_LOG_PATH };

if (require.main === module) {
  const taskText = process.argv[2];
  const threadSlug = process.argv[3];
  const callerAgent = process.argv[4] || 'cli';
  if (!taskText || !threadSlug) {
    console.error('usage: node openhuman-subtask.cjs "<task text>" <threadSlug> [callerAgent] [workspaceSlug]');
    process.exit(1);
  }
  runSubtask(taskText, { threadSlug, workspaceSlug: process.argv[5] || 'world', callerAgent })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exitCode = r.result === 'PASS' ? 0 : 1; })
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
