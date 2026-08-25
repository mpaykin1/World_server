(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PixelAnimationWorker = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  function supported(canvas) { return Boolean(root.Worker && canvas && typeof canvas.transferControlToOffscreen === 'function'); }
  function create(canvas, options) {
    const opts = options || {};
    if (!supported(canvas)) throw new Error('OffscreenCanvas worker rendering unavailable');
    const worker = new Worker(opts.workerUrl || '/shared/pixel-animation-worker.js');
    const offscreen = canvas.transferControlToOffscreen();
    let nextId = 1, ready = false, destroyed = false;
    const listeners = new Map();
    const emit = (type, data) => { const list = listeners.get(type); if (list) for (const fn of list) fn(data); };
    worker.onmessage = (event) => { const msg = event.data || {}; if (msg.type === 'ready') ready = true; emit(msg.type || 'message', msg); };
    worker.onerror = (event) => emit('error', { type: 'error', message: event.message || 'worker_error' });
    worker.postMessage({ type: 'init', canvas: offscreen, engineUrl: opts.engineUrl || '/shared/pixel-animation-engine.js', atlasUrl: opts.atlasUrl, configUrl: opts.configUrl, configTimeoutMs: opts.configTimeoutMs, camera: opts.camera, statsIntervalMs: opts.statsIntervalMs || 1000, options: opts.engineOptions || {} }, [offscreen]);
    const post = (message) => { if (!destroyed) worker.postMessage(message); };
    return {
      get ready() { return ready; },
      spawn(spec) { const id = spec && spec.id != null ? spec.id : nextId++; post({ type: 'spawn', spec: { ...(spec || {}), id } }); return id; },
      update(id, patch) { post({ type: 'update', id, patch }); }, remove(id) { post({ type: 'remove', id }); }, clear() { post({ type: 'clear' }); },
      setCamera(camera) { post({ type: 'camera', camera }); }, resize(width, height) { post({ type: 'resize', width, height }); }, setProfiles(profiles) { post({ type: 'profiles', profiles }); }, setPolicy(policy) { post({ type: 'policy', policy }); },
      pause() { post({ type: 'pause' }); }, resume() { post({ type: 'resume' }); }, requestStats(requestId) { post({ type: 'stats', requestId }); },
      on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
      destroy() { if (destroyed) return; post({ type: 'destroy' }); destroyed = true; listeners.clear(); setTimeout(() => worker.terminate(), 100); },
    };
  }
  return Object.freeze({ supported, create });
});
