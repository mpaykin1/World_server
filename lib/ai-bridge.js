'use strict';

/**
 * lib/ai-bridge.js
 * Core cloud-first GitHub AI coordination bridge between ChatGPT and Jules.
 */

const fs = require('fs');
const path = require('path');
const collectiveBrain = require('./collective-brain');

const ROOT = path.resolve(__dirname, '..');
const BRIDGE_DIR = path.join(ROOT, '.ai', 'bridge');
const README_PATH = path.join(BRIDGE_DIR, 'README.md');
const STATE_PATH = path.join(BRIDGE_DIR, 'state.json');
const TASKS_PATH = path.join(BRIDGE_DIR, 'tasks.jsonl');
const RESULTS_PATH = path.join(BRIDGE_DIR, 'results.jsonl');

const STALE_THRESHOLD_MS = Number(process.env.AI_BRIDGE_STALE_MS || 15 * 60 * 1000); // 15 minutes
const MAX_RETRIES = Number(process.env.AI_BRIDGE_MAX_RETRIES || 2);

const REQUIRED_SCHEMA_FIELDS = [
  'id',
  'timestamp',
  'sender',
  'recipient',
  'type',
  'priority',
  'status',
  'summary',
  'branch',
  'commit',
  'PR',
  'tests',
  'blockers',
  'next_action'
];

function ensureBridgeDir() {
  if (!fs.existsSync(BRIDGE_DIR)) {
    fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATE_PATH)) {
    const initialState = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      claimed_tasks: {},
      completed_tasks: []
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(initialState, null, 2) + '\n');
  }
  if (!fs.existsSync(TASKS_PATH)) {
    fs.writeFileSync(TASKS_PATH, '');
  }
  if (!fs.existsSync(RESULTS_PATH)) {
    fs.writeFileSync(RESULTS_PATH, '');
  }
}

function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { ok: false, error: 'Record must be a non-null object' };
  }
  const missing = [];
  for (const field of REQUIRED_SCHEMA_FIELDS) {
    if (record[field] === undefined) {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing required schema field(s): ${missing.join(', ')}` };
  }
  if (!Array.isArray(record.blockers)) {
    return { ok: false, error: 'Field "blockers" must be an array' };
  }
  return { ok: true };
}

function readState(baseDir = ROOT) {
  ensureBridgeDir();
  const stateFile = path.join(baseDir, '.ai', 'bridge', 'state.json');
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    return {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      claimed_tasks: {},
      completed_tasks: []
    };
  }
}

function writeState(state, baseDir = ROOT) {
  ensureBridgeDir();
  const stateFile = path.join(baseDir, '.ai', 'bridge', 'state.json');
  state.last_updated = new Date().toISOString();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        items.push(JSON.parse(trimmed));
      } catch (e) {
        // skip corrupted line
      }
    }
  }
  return items;
}

function appendJsonl(filePath, record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(filePath, line);
}

function readTasks(baseDir = ROOT) {
  ensureBridgeDir();
  const tasksFile = path.join(baseDir, '.ai', 'bridge', 'tasks.jsonl');
  return readJsonl(tasksFile);
}

function readResults(baseDir = ROOT) {
  ensureBridgeDir();
  const resultsFile = path.join(baseDir, '.ai', 'bridge', 'results.jsonl');
  return readJsonl(resultsFile);
}

/**
 * Format a task entry as ChatGPT -> Jules CLI protocol string
 */
function formatChatGptToJules(task) {
  return [
    'CHATGPT -> JULES',
    `task_id: ${task.id}`,
    `priority: ${task.priority || 'P1'}`,
    `task: ${task.summary || ''}`,
    `acceptance_criteria: ${task.acceptance_criteria ? JSON.stringify(task.acceptance_criteria) : 'N/A'}`
  ].join('\n');
}

/**
 * Format a result entry as Jules -> ChatGPT CLI protocol string
 */
function formatJulesToChatGpt(result) {
  return [
    'JULES -> CHATGPT',
    `task_id: ${result.id}`,
    `status: ${result.status}`,
    `branch: ${result.branch || 'N/A'}`,
    `commit: ${result.commit || 'N/A'}`,
    `PR: ${result.PR || 'N/A'}`,
    `tests: ${result.tests || 'N/A'}`,
    `result: ${result.summary || 'N/A'}`,
    `next_action: ${result.next_action || 'N/A'}`
  ].join('\n');
}

/**
 * Enqueue a new task into tasks.jsonl
 */
function enqueueTask(taskInput, baseDir = ROOT) {
  ensureBridgeDir();
  const now = new Date().toISOString();
  const record = {
    id: taskInput.id || `task-${Date.now()}`,
    timestamp: taskInput.timestamp || now,
    sender: taskInput.sender || 'ChatGPT',
    recipient: taskInput.recipient || 'Jules',
    type: taskInput.type || 'task',
    priority: taskInput.priority || 'P1',
    status: 'pending',
    summary: taskInput.summary || taskInput.task || '',
    branch: taskInput.branch || null,
    commit: taskInput.commit || null,
    PR: taskInput.PR || null,
    tests: taskInput.tests || 'Pending execution',
    blockers: taskInput.blockers || [],
    next_action: taskInput.next_action || 'Awaiting claim by Jules',
    acceptance_criteria: taskInput.acceptance_criteria || null,
    payload: taskInput.payload || null
  };

  const validation = validateRecord(record);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  // Check if task ID already exists
  const existingTasks = readTasks(baseDir);
  if (existingTasks.some((t) => t.id === record.id)) {
    return { ok: false, error: `Task ID ${record.id} already exists in queue` };
  }

  const tasksFile = path.join(baseDir, '.ai', 'bridge', 'tasks.jsonl');
  appendJsonl(tasksFile, record);
  return { ok: true, task: record };
}

/**
 * Claim next pending task for a specific worker/agent safely and idempotently.
 */
function claimNextTask(agentName = 'Jules', baseDir = ROOT) {
  ensureBridgeDir();

  // Acquire file lease for bridge worker safety
  const lease = collectiveBrain.acquireLease(baseDir, 'ai-bridge-claim', { owner: agentName, ttlMs: 30000 });
  if (!lease.ok) {
    return { ok: false, error: 'Could not acquire concurrency lease for AI bridge claim' };
  }

  try {
    const state = readState(baseDir);
    const tasks = readTasks(baseDir);
    const results = readResults(baseDir);

    const completedIds = new Set([
      ...(state.completed_tasks || []),
      ...results.filter((r) => r.status === 'completed' || r.status === 'failed').map((r) => r.id)
    ]);

    for (const task of tasks) {
      // Check recipient and completion status
      if (task.recipient && task.recipient !== agentName && task.recipient !== 'all') {
        continue;
      }
      if (completedIds.has(task.id)) {
        continue;
      }

      const existingClaim = state.claimed_tasks[task.id];
      if (existingClaim && existingClaim.status === 'claimed') {
        // Task already claimed and active
        continue;
      }

      // Claim the task
      const now = new Date().toISOString();
      state.claimed_tasks[task.id] = {
        agent: agentName,
        claimed_at: now,
        status: 'claimed',
        retry_count: (existingClaim ? existingClaim.retry_count : 0)
      };
      writeState(state, baseDir);

      const claimedRecord = {
        ...task,
        status: 'claimed',
        recipient: agentName,
        timestamp: now,
        next_action: `In progress by ${agentName}`
      };

      return { ok: true, task: claimedRecord };
    }

    return { ok: true, task: null, message: 'No pending tasks found for ' + agentName };
  } finally {
    collectiveBrain.releaseLease(baseDir, 'ai-bridge-claim', agentName);
  }
}

/**
 * Post result for a task. Updates state.json and appends to results.jsonl.
 */
function postResult(resultInput, baseDir = ROOT) {
  ensureBridgeDir();

  const lease = collectiveBrain.acquireLease(baseDir, 'ai-bridge-result', { owner: resultInput.sender || 'Jules', ttlMs: 30000 });
  if (!lease.ok) {
    return { ok: false, error: 'Could not acquire concurrency lease for posting result' };
  }

  try {
    const now = new Date().toISOString();
    const record = {
      id: resultInput.id,
      timestamp: resultInput.timestamp || now,
      sender: resultInput.sender || 'Jules',
      recipient: resultInput.recipient || 'ChatGPT',
      type: resultInput.type || 'result',
      priority: resultInput.priority || 'P1',
      status: resultInput.status || 'completed',
      summary: resultInput.summary || resultInput.result || '',
      branch: resultInput.branch || null,
      commit: resultInput.commit || null,
      PR: resultInput.PR || null,
      tests: resultInput.tests || 'N/A',
      blockers: resultInput.blockers || [],
      next_action: resultInput.next_action || 'Completed'
    };

    const validation = validateRecord(record);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    const resultsFile = path.join(baseDir, '.ai', 'bridge', 'results.jsonl');
    appendJsonl(resultsFile, record);

    const state = readState(baseDir);
    if (record.status === 'completed' || record.status === 'failed') {
      if (!state.completed_tasks.includes(record.id)) {
        state.completed_tasks.push(record.id);
      }
      delete state.claimed_tasks[record.id];
    } else {
      state.claimed_tasks[record.id] = {
        agent: record.sender,
        claimed_at: now,
        status: record.status,
        retry_count: (state.claimed_tasks[record.id] ? state.claimed_tasks[record.id].retry_count : 0)
      };
    }
    writeState(state, baseDir);

    return { ok: true, result: record };
  } finally {
    collectiveBrain.releaseLease(baseDir, 'ai-bridge-result', resultInput.sender || 'Jules');
  }
}

/**
 * Recover stale tasks that were claimed but never completed within STALE_THRESHOLD_MS.
 */
function recoverStaleTasks(baseDir = ROOT, thresholdMs = STALE_THRESHOLD_MS) {
  ensureBridgeDir();
  const lease = collectiveBrain.acquireLease(baseDir, 'ai-bridge-recover', { owner: 'system', ttlMs: 30000 });
  if (!lease.ok) {
    return { ok: false, error: 'Could not acquire lease for stale recovery' };
  }

  try {
    const state = readState(baseDir);
    const now = Date.now();
    const recovered = [];
    const deadLettered = [];

    for (const [taskId, claim] of Object.entries(state.claimed_tasks || {})) {
      if (claim.status !== 'claimed' && claim.status !== 'in_progress') {
        continue;
      }
      const claimedTime = new Date(claim.claimed_at).getTime();
      if (now - claimedTime > thresholdMs) {
        const nextRetry = (claim.retry_count || 0) + 1;
        if (nextRetry > MAX_RETRIES) {
          // Bounded retry limit reached -> dead letter
          postResult({
            id: taskId,
            sender: 'system',
            recipient: 'all',
            type: 'result',
            priority: 'P0',
            status: 'failed',
            summary: `Task ${taskId} timed out after ${thresholdMs}ms and exceeded max retries (${MAX_RETRIES}).`,
            blockers: ['Stale task timeout / dead letter'],
            next_action: 'Manual inspection required'
          }, baseDir);
          deadLettered.push(taskId);
        } else {
          // Reset claim so it becomes available again
          state.claimed_tasks[taskId] = {
            agent: null,
            claimed_at: null,
            status: 'pending',
            retry_count: nextRetry
          };
          recovered.push(taskId);
        }
      }
    }

    writeState(state, baseDir);
    return { ok: true, recovered, deadLettered };
  } finally {
    collectiveBrain.releaseLease(baseDir, 'ai-bridge-recover', 'system');
  }
}

/**
 * Verify integrity and get summary state of the bridge.
 */
function syncBridge(baseDir = ROOT) {
  ensureBridgeDir();
  const state = readState(baseDir);
  const tasks = readTasks(baseDir);
  const results = readResults(baseDir);
  const recovery = recoverStaleTasks(baseDir);

  const pendingTasks = tasks.filter((t) => {
    const isCompleted = state.completed_tasks.includes(t.id);
    const claim = state.claimed_tasks[t.id];
    return !isCompleted && (!claim || claim.status === 'pending');
  });

  return {
    ok: true,
    total_tasks: tasks.length,
    pending_tasks: pendingTasks.length,
    completed_tasks: state.completed_tasks.length,
    claimed_tasks: Object.keys(state.claimed_tasks).length,
    recovery,
    last_updated: state.last_updated
  };
}

module.exports = {
  REQUIRED_SCHEMA_FIELDS,
  validateRecord,
  readState,
  writeState,
  readTasks,
  readResults,
  enqueueTask,
  claimNextTask,
  postResult,
  recoverStaleTasks,
  syncBridge,
  formatChatGptToJules,
  formatJulesToChatGpt
};
