'use strict';

const path = require('path');
const os = require('os');
const core = require('../shared/world-procedural-core');
const grammar = require('./world-procedural-grammar');
let WorkerCtor = null;
try { WorkerCtor = require('worker_threads').Worker; } catch { WorkerCtor = null; }

class ProceduralWorkerPool {
  constructor(options = {}) {
    const cpu = Math.max(1, os.cpus()?.length || 1);
    this.size = Math.max(1, Math.min(8, Math.trunc(Number(options.size) || Math.max(1, cpu - 1))));
    this.useWorkers = options.useWorkers !== false && Boolean(WorkerCtor);
    this.workerPath = options.workerPath || path.join(__dirname, '..', 'shared', 'world-procedural-worker.js');
    this.workers = [];
    this.queue = [];
    this.pending = new Map();
    this.sequence = 0;
    this.closing = false;
    if (this.useWorkers) for (let i = 0; i < this.size; i += 1) this._spawn();
  }

  _spawn() {
    const worker = new WorkerCtor(this.workerPath);
    const state = { worker, busy: false, taskId: null, dead: false };
    worker.on('message', (message) => {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      state.busy = false;
      state.taskId = null;
      if (pending) message.ok ? pending.resolve(message.chunk) : pending.reject(new Error(message.error || 'worker task failed'));
      this._drain();
    });
    worker.on('error', (error) => {
      if (state.taskId != null) {
        const pending = this.pending.get(state.taskId);
        this.pending.delete(state.taskId);
        pending?.reject(error);
      }
      state.busy = false;
      state.taskId = null;
      state.dead = true;
    });
    worker.on('exit', (code) => {
      state.dead = true;
      const index = this.workers.indexOf(state);
      if (index >= 0) this.workers.splice(index, 1);
      if (!this.closing && this.useWorkers) this._spawn();
      this._drain();
    });
    this.workers.push(state);
  }

  _drain() {
    for (const state of this.workers) {
      if (state.busy || state.dead) continue;
      const task = this.queue.shift();
      if (!task) break;
      state.busy = true;
      state.taskId = task.message.id;
      this.pending.set(task.message.id, task);
      state.worker.postMessage(task.message);
    }
  }

  generateChunk(recipe, chunkX, chunkZ, options = {}) {
    const postProcess = (chunk) => {
      if (options.grammar !== true) return chunk;
      const regionChunks = Math.max(1, Math.min(16, Math.trunc(Number(options.regionChunks) || 4)));
      const plan = grammar.compileRegionPlan(recipe, Math.floor(Math.trunc(chunkX) / regionChunks), Math.floor(Math.trunc(chunkZ) / regionChunks), options);
      return grammar.applyRegionPlanToChunk(chunk, plan, options);
    };
    if (!this.useWorkers) return Promise.resolve(postProcess(core.generateVoxelChunk(recipe, chunkX, chunkZ, options)));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve: (chunk) => resolve(postProcess(chunk)), reject, message: { id, type: 'generate-chunk', recipe: core.normalizeRecipe(recipe), chunkX: Math.trunc(chunkX), chunkZ: Math.trunc(chunkZ), options } });
      this._drain();
    });
  }

  async close() {
    this.closing = true;
    const workers = this.workers.splice(0);
    this.queue.splice(0).forEach((task) => task.reject(new Error('worker pool closed')));
    await Promise.all(workers.map((state) => state.worker.terminate().catch(() => undefined)));
  }
}

function createBrowserWorkerClient(url = '/shared/world-procedural-worker.js') {
  if (typeof Worker === 'undefined') throw new Error('Web Worker unavailable');
  const worker = new Worker(url);
  let sequence = 0;
  const pending = new Map();
  worker.onmessage = (event) => {
    const message = event.data;
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (!message.ok) return task.reject(new Error(message.error || 'browser worker task failed'));
    let chunk = message.chunk;
    if (task.options?.grammar === true) {
      const regionChunks = Math.max(1, Math.min(16, Math.trunc(Number(task.options.regionChunks) || 4)));
      const plan = grammar.compileRegionPlan(task.recipe, Math.floor(task.chunkX / regionChunks), Math.floor(task.chunkZ / regionChunks), task.options);
      chunk = grammar.applyRegionPlanToChunk(chunk, plan, task.options);
    }
    task.resolve(chunk);
  };
  worker.onerror = (event) => {
    const error = new Error(event?.message || 'browser worker failed');
    for (const task of pending.values()) task.reject(error);
    pending.clear();
  };
  return {
    generateChunk(recipe, chunkX, chunkZ, options = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, recipe, chunkX: Math.trunc(chunkX), chunkZ: Math.trunc(chunkZ), options });
        worker.postMessage({ id, type: 'generate-chunk', recipe, chunkX, chunkZ, options });
      });
    },
    close() { worker.terminate(); pending.clear(); }
  };
}

module.exports = { ProceduralWorkerPool, createBrowserWorkerClient };
