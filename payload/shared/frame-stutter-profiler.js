'use strict';

(function () {
  if (window.__WORLD_SERVER_STUTTER_PROFILER__) return;
  window.__WORLD_SERVER_STUTTER_PROFILER__ = true;

  const app = (location.pathname.match(/\/apps\/([^/]+)/) || [])[1] || 'unknown';
  const endpoint = '/api/quality-telemetry';
  const windows = [];
  const renderers = new Set();
  let frames = [];
  let last = performance.now();
  let lastFlush = last;
  let longTaskMs = 0;
  let prewarmMs = null;
  let prewarmStatus = 'not-run';

  function pct(values, p) {
    if (!values.length) return 0;
    const a = [...values].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.max(0, Math.ceil(a.length * p) - 1))] || 0;
  }
  function post(type, data = {}) {
    const body = JSON.stringify({ type, app, path: location.pathname, ...data });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      else fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch {}
  }
  try {
    const po = new PerformanceObserver(list => {
      for (const e of list.getEntries()) longTaskMs += Math.max(0, Number(e.duration) || 0);
    });
    po.observe({ entryTypes: ['longtask'] });
  } catch {}

  function flush(now) {
    const p95 = pct(frames, 0.95);
    const p99 = pct(frames, 0.99);
    const stalls50 = frames.filter(x => x > 50).length;
    const stalls100 = frames.filter(x => x > 100).length;
    const score = Math.min(1, (p95 / 60) * 0.45 + (p99 / 120) * 0.25 + (stalls50 / Math.max(1, frames.length)) * 0.2 + Math.min(1, longTaskMs / 500) * 0.1);
    const result = {
      frameP95Ms: Math.round(p95),
      frameP99Ms: Math.round(p99),
      stalls50,
      stalls100,
      longTaskMs: Math.round(longTaskMs),
      stutterScore: Number(score.toFixed(3)),
      prewarmMs,
      prewarmStatus
    };
    windows.push(result);
    if (windows.length > 12) windows.shift();
    dispatchEvent(new CustomEvent('worldserver:stutter', { detail: result }));
    if (score >= 0.34) {
      try { window.WorldServerGraphicsQuality?.apply(score >= 0.62 ? 'performance' : 'balanced', { source: 'stutter-profiler', ...result }); } catch {}
    }
    post('runtime_stutter', { ...result, qualityProfile: window.WorldServerPWA?.state?.profile || null, capabilityClass: window.WorldServerDeviceQuality?.state?.capabilityClass || null, heapMb: window.WorldServerDeviceQuality?.state?.jsHeapMb ?? null, webglContextLosses: window.WorldServerDeviceQuality?.state?.webglContextLosses ?? null, iosWebkit: /iP(?:hone|ad|od)/i.test(String(navigator.userAgent || '')), standalonePwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true });
    frames = [];
    longTaskMs = 0;
    lastFlush = now;
  }

  function tick(now) {
    const dt = Math.max(0, now - last);
    last = now;
    if (dt < 1000) frames.push(dt);
    if (frames.length > 600) frames.shift();
    if (now - lastFlush >= 10000) flush(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  async function prewarmThree(renderer, scene, camera) {
    if (!renderer || !scene || !camera || document.visibilityState !== 'visible') return false;
    const started = performance.now();
    prewarmStatus = 'running';
    try {
      await new Promise(resolve => {
        const run = () => resolve();
        if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1800 });
        else setTimeout(run, 120);
      });
      if (typeof renderer.compileAsync === 'function') await renderer.compileAsync(scene, camera);
      else if (typeof renderer.compile === 'function') renderer.compile(scene, camera);
      prewarmMs = Math.round(performance.now() - started);
      prewarmStatus = 'ok';
      post('shader_prewarm', { prewarmMs, stutterScore: 0, message: 'three-compile' });
      return true;
    } catch (error) {
      prewarmMs = Math.round(performance.now() - started);
      prewarmStatus = 'failed';
      post('shader_prewarm_error', { prewarmMs, message: String(error?.message || error).slice(0, 200) });
      return false;
    }
  }

  function registerThree({ renderer, scene, camera, prewarm = true } = {}) {
    if (!renderer || renderers.has(renderer)) return () => {};
    renderers.add(renderer);
    if (prewarm) prewarmThree(renderer, scene, camera);
    return () => renderers.delete(renderer);
  }

  window.WorldServerStutterProfiler = Object.freeze({
    registerThree,
    prewarmThree,
    get state() { return Object.freeze({ windows: [...windows], prewarmMs, prewarmStatus }); }
  });
})();
