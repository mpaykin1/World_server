'use strict';

const fs = require('fs');
const path = require('path');
const { resolveMainTreeRoot } = require('./world-server-paths');

const MAIN_ROOT = resolveMainTreeRoot();
const DEFAULT_BRIDGE_DIR = path.join(MAIN_ROOT, '.ai', 'bridge');

// Explicit list of 14 mandatory fields for all bridge records
const REQUIRED_FIELDS = [
  'id', 'timestamp', 'sender', 'recipient', 'type',
  'priority', 'status', 'summary', 'branch', 'commit',
  'PR', 'tests', 'blockers', 'next_action'
];

function getPaths(bridgeDir = DEFAULT_BRIDGE_DIR) {
  return {
    bridgeDir,
    readmePath: path.join(bridgeDir, 'README.md'),
    statePath: path.join(bridgeDir, 'state.json'),
    tasksPath: path.join(bridgeDir, 'tasks.jsonl'),
    resultsPath: path.join(bridgeDir, 'results.jsonl')
  };
}

function ensureBridgeDir(bridgeDir = DEFAULT_BRIDGE_DIR) {
  const paths = getPaths(bridgeDir);
  fs.mkdirSync(bridgeDir, { recursive: true });
  if (!fs.existsSync(paths.statePath)) {
    const initialState = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      canonicalIssue: 'AI Bridge — ChatGPT ↔ Jules',
      activeWorker: null,
      activeLeases: {},
      processedCommentIds: [],
      lastProcessedTaskId: null,
      lastProcessedResultId: null,
      staleThresholdMs: 900000,
      stats: { totalTasks: 0, completedTasks: 0, failedTasks: 0, reclaimedTasks: 0 }
    };
    fs.writeFileSync(paths.statePath, JSON.stringify(initialState, null, 2) + '\n');
  }
  if (!fs.existsSync(paths.tasksPath)) fs.writeFileSync(paths.tasksPath, '');
  if (!fs.existsSync(paths.resultsPath)) fs.writeFileSync(paths.resultsPath, '');
  return paths;
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, error: 'Record must be an object' };
  }
  const missing = [];
  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing mandatory fields: ${missing.join(', ')}` };
  }
  if (!Array.isArray(record.blockers)) {
    return { ok: false, error: 'Field "blockers" must be an array' };
  }
  return { ok: true };
}

function normalizeRecord(data, defaultType = 'task') {
  const now = new Date().toISOString();
  return {
    id: String(data.id || `${defaultType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    timestamp: String(data.timestamp || now),
    sender: String(data.sender || 'System'),
    recipient: String(data.recipient || 'Jules'),
    type: String(data.type || defaultType),
    priority: String(data.priority || 'normal'),
    status: String(data.status || 'queued'),
    summary: String(data.summary || 'No summary provided'),
    branch: data.branch !== undefined ? data.branch : null,
    commit: data.commit !== undefined ? data.commit : null,
    PR: data.PR !== undefined ? data.PR : null,
    tests: data.tests !== undefined ? data.tests : 'untested',
    blockers: Array.isArray(data.blockers) ? data.blockers : [],
    next_action: String(data.next_action || 'awaiting_processing')
  };
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const records = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line));
    } catch {
      // Ignore corrupt lines safely
    }
  }
  return records;
}

function appendJsonl(filePath, record) {
  const validation = validateRecord(record);
  if (!validation.ok) {
    throw new Error(`Cannot append invalid record to ${filePath}: ${validation.error}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf8');
}

function readState(bridgeDir = DEFAULT_BRIDGE_DIR) {
  const paths = ensureBridgeDir(bridgeDir);
  try {
    return JSON.parse(fs.readFileSync(paths.statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(bridgeDir = DEFAULT_BRIDGE_DIR, state) {
  const paths = ensureBridgeDir(bridgeDir);
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(paths.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function parseCommentTask(commentBody, commentId = null) {
  if (!commentBody || typeof commentBody !== 'string') return null;
  const trimmed = commentBody.trim();
  if (!trimmed.includes('[AI-BRIDGE TASK]')) return null;

  const lines = trimmed.split(/\r?\n/);
  const taskObj = {
    taskId: null,
    priority: 'normal',
    task: '',
    acceptanceCriteria: '',
    sender: 'ChatGPT',
    recipient: 'Jules'
  };

  let inTask = false;
  let inCriteria = false;
  const taskLines = [];
  const criteriaLines = [];

  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('task_id:') || l.startsWith('taskId:')) {
      taskObj.taskId = l.split(':')[1].trim();
      inTask = false; inCriteria = false;
    } else if (l.startsWith('priority:')) {
      taskObj.priority = l.split(':')[1].trim();
      inTask = false; inCriteria = false;
    } else if (l.startsWith('task:')) {
      taskLines.push(l.slice(5).trim());
      inTask = true; inCriteria = false;
    } else if (l.startsWith('acceptance_criteria:') || l.startsWith('acceptanceCriteria:')) {
      criteriaLines.push(l.slice(l.indexOf(':') + 1).trim());
      inTask = false; inCriteria = true;
    } else if (inTask) {
      taskLines.push(l);
    } else if (inCriteria) {
      criteriaLines.push(l);
    }
  }

  taskObj.task = taskLines.join('\n').trim();
  taskObj.acceptanceCriteria = criteriaLines.join('\n').trim();

  if (!taskObj.taskId && commentId) {
    taskObj.taskId = `task_comment_${commentId}`;
  }

  if (!taskObj.task) {
    taskObj.task = trimmed.replace('[AI-BRIDGE TASK]', '').trim();
  }

  return taskObj;
}

function getBridgeStatusSummary(bridgeDir = DEFAULT_BRIDGE_DIR) {
  const paths = ensureBridgeDir(bridgeDir);
  const state = readState(bridgeDir);
  const tasks = readJsonl(paths.tasksPath);
  const results = readJsonl(paths.resultsPath);
  return {
    healthy: true,
    canonicalIssue: state.canonicalIssue || 'AI Bridge — ChatGPT ↔ Jules',
    taskCount: tasks.length,
    resultCount: results.length,
    activeLeasesCount: Object.keys(state.activeLeases || {}).length,
    updatedAt: state.updatedAt
  };
}

function enqueueTask(bridgeDir = DEFAULT_BRIDGE_DIR, taskData) {
  const paths = ensureBridgeDir(bridgeDir);
  const record = normalizeRecord(taskData, 'task');
  const validation = validateRecord(record);
  if (!validation.ok) {
    throw new Error(`Task validation failed: ${validation.error}`);
  }

  // Idempotency check: don't enqueue duplicate active IDs
  const existingTasks = readJsonl(paths.tasksPath);
  if (existingTasks.some((t) => t.id === record.id)) {
    return { ok: true, duplicated: true, record: existingTasks.find((t) => t.id === record.id) };
  }

  appendJsonl(paths.tasksPath, record);

  const state = readState(bridgeDir);
  state.stats = state.stats || {};
  state.stats.totalTasks = (state.stats.totalTasks || 0) + 1;
  writeState(bridgeDir, state);

  return { ok: true, duplicated: false, record };
}

function appendResult(bridgeDir = DEFAULT_BRIDGE_DIR, resultData) {
  const paths = ensureBridgeDir(bridgeDir);
  const record = normalizeRecord(resultData, 'result');
  const validation = validateRecord(record);
  if (!validation.ok) {
    throw new Error(`Result validation failed: ${validation.error}`);
  }

  appendJsonl(paths.resultsPath, record);

  const state = readState(bridgeDir);
  state.lastProcessedResultId = record.id;
  if (record.status === 'completed') {
    state.stats.completedTasks = (state.stats.completedTasks || 0) + 1;
  } else if (record.status === 'failed') {
    state.stats.failedTasks = (state.stats.failedTasks || 0) + 1;
  }
  writeState(bridgeDir, state);

  return { ok: true, record };
}

function recoverStaleTasks(bridgeDir = DEFAULT_BRIDGE_DIR, nowMs = Date.now()) {
  const paths = ensureBridgeDir(bridgeDir);
  const state = readState(bridgeDir);
  const threshold = state.staleThresholdMs || 900000; // 15 mins
  const activeLeases = state.activeLeases || {};
  const reclaimed = [];

  let stateChanged = false;

  for (const [taskId, lease] of Object.entries(activeLeases)) {
    const claimedAt = new Date(lease.claimedAt || 0).getTime();
    if (nowMs - claimedAt > threshold) {
      delete activeLeases[taskId];
      stateChanged = true;

      const reclaimResult = normalizeRecord({
        id: `reclaim_${taskId}_${Date.now()}`,
        sender: 'BridgeWorker',
        recipient: lease.workerId || 'All',
        type: 'reclaim',
        priority: 'high',
        status: 'stale_reclaimed',
        summary: `Abandoned claimed task ${taskId} reclaimed after timeout.`,
        branch: null,
        commit: null,
        PR: null,
        tests: 'stale_recovery',
        blockers: [`Task processing exceeded ${threshold}ms`],
        next_action: 'Task returned to queued status for retry.'
      }, 'reclaim');

      appendResult(bridgeDir, reclaimResult);
      reclaimed.push(taskId);

      state.stats = state.stats || {};
      state.stats.reclaimedTasks = (state.stats.reclaimedTasks || 0) + 1;
    }
  }

  if (stateChanged) {
    state.activeLeases = activeLeases;
    writeState(bridgeDir, state);
  }

  return reclaimed;
}

function claimNextTask(bridgeDir = DEFAULT_BRIDGE_DIR, workerId = 'Jules') {
  const paths = ensureBridgeDir(bridgeDir);
  recoverStaleTasks(bridgeDir);

  const tasks = readJsonl(paths.tasksPath);
  const results = readJsonl(paths.resultsPath);
  const state = readState(bridgeDir);
  const activeLeases = state.activeLeases || {};

  // Find completed / terminal task IDs
  const completedTaskIds = new Set(
    results.filter((r) => r.type === 'result' && (r.status === 'completed' || r.status === 'failed')).map((r) => {
      // match task_id if present in summary or id
      return r.id.replace(/^res_/, '');
    })
  );

  for (const task of tasks) {
    if (completedTaskIds.has(task.id)) continue;
    if (activeLeases[task.id]) continue; // Already claimed

    if (task.recipient === 'All' || task.recipient === workerId || task.recipient === 'Jules') {
      // Claim task
      activeLeases[task.id] = {
        workerId,
        claimedAt: new Date().toISOString()
      };
      state.activeLeases = activeLeases;
      state.lastProcessedTaskId = task.id;
      writeState(bridgeDir, state);

      const claimRecord = normalizeRecord({
        id: `claim_${task.id}`,
        sender: workerId,
        recipient: task.sender,
        type: 'claim',
        priority: task.priority,
        status: 'claimed',
        summary: `Claimed task ${task.id}: ${task.summary}`,
        branch: task.branch,
        commit: task.commit,
        PR: task.PR,
        tests: task.tests,
        blockers: [],
        next_action: 'Executing task goals'
      }, 'claim');

      appendResult(bridgeDir, claimRecord);

      return {
        ok: true,
        task,
        claimRecord
      };
    }
  }

  return { ok: false, message: 'No claimable tasks available in queue' };
}

function completeTask(bridgeDir = DEFAULT_BRIDGE_DIR, taskId, outcomeData = {}) {
  const paths = ensureBridgeDir(bridgeDir);
  const state = readState(bridgeDir);
  const activeLeases = state.activeLeases || {};

  delete activeLeases[taskId];
  state.activeLeases = activeLeases;
  writeState(bridgeDir, state);

  const resultRecord = normalizeRecord({
    id: outcomeData.id || `res_${taskId}`,
    sender: outcomeData.sender || 'Jules',
    recipient: outcomeData.recipient || 'ChatGPT',
    type: 'result',
    priority: outcomeData.priority || 'normal',
    status: outcomeData.status || 'completed',
    summary: outcomeData.summary || `Completed task ${taskId}`,
    branch: outcomeData.branch || null,
    commit: outcomeData.commit || null,
    PR: outcomeData.PR || null,
    tests: outcomeData.tests || 'all_passed',
    blockers: outcomeData.blockers || [],
    next_action: outcomeData.next_action || 'inspect_result'
  }, 'result');

  return appendResult(bridgeDir, resultRecord);
}

module.exports = {
  REQUIRED_FIELDS,
  getPaths,
  ensureBridgeDir,
  validateRecord,
  normalizeRecord,
  readJsonl,
  appendJsonl,
  readState,
  writeState,
  parseCommentTask,
  getBridgeStatusSummary,
  enqueueTask,
  appendResult,
  recoverStaleTasks,
  claimNextTask,
  completeTask
};
