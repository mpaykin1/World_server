'use strict';

(function bootstrapWorker() {
  let core = null;
  let parentPort = null;
  let isNode = false;
  try {
    if (typeof require === 'function') {
      core = require('./world-procedural-core');
      parentPort = require('worker_threads').parentPort;
      isNode = Boolean(parentPort);
    }
  } catch { /* browser worker */ }
  if (!core && typeof importScripts === 'function') {
    importScripts('world-procedural-core.js');
    core = self.WorldProceduralCore;
  }
  if (!core) throw new Error('WorldProceduralCore unavailable in worker');

  function execute(message) {
    if (!message || message.type !== 'generate-chunk') throw new Error('unsupported procedural worker task');
    const chunk = core.generateVoxelChunk(message.recipe, message.chunkX, message.chunkZ, message.options || {});
    return { id: message.id, ok: true, chunk };
  }
  function respond(send, message) {
    try { send(execute(message)); }
    catch (error) { send({ id: message?.id, ok: false, error: String(error?.message || error) }); }
  }
  if (isNode) parentPort.on('message', (message) => respond((payload) => parentPort.postMessage(payload), message));
  else self.onmessage = (event) => respond((payload) => self.postMessage(payload), event.data);
})();
