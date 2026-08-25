'use strict';

(function () {
  if (window.__WORLD_SERVER_PWA_RUNTIME__) return;
  window.__WORLD_SERVER_PWA_RUNTIME__ = true;

  const app = (location.pathname.match(/\/apps\/([^/]+)/) || [])[1] || 'unknown';
  const endpoint = '/api/quality-telemetry';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const iosWebkit = /iP(?:hone|ad|od)/i.test(String(navigator.userAgent || ''));
  const profileStorageKey = `worldserver.quality-profile.${app}`;
  let rememberedProfile = 'high';
  try {
    const record = JSON.parse(localStorage.getItem(profileStorageKey) || 'null');
    if (record && ['performance','balanced','high','ultra'].includes(record.profile) && Date.now() - Number(record.ts || 0) < 7 * 86400000) rememberedProfile = record.profile;
  } catch {}
  const listeners = new Set();
  const rendererCleanups = new Set();

  const state = {
    app,
    standalone,
    serviceWorker: 'unsupported',
    profile: rememberedProfile,
    fps: null,
    frameP95Ms: null,
    animationJankRate: null,
    inputLatencyP95Ms: null,
    longTaskMs: 0,
    online: navigator.onLine !== false,
    iosWebkit,
    serverRecommendation: null
  };

  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  }

  function post(type, data = {}) {
    const payload = {
      type,
      app,
      path: location.pathname,
      ts: Date.now(),
      ...data
    };
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true
        }).catch(() => {});
      }
    } catch {}
  }

  function emitProfile(next, evidence = {}) {
    if (!next || next === state.profile) return;
    const previous = state.profile;
    state.profile = next;
    try { localStorage.setItem(profileStorageKey, JSON.stringify({ profile: next, ts: Date.now() })); } catch {}
    document.documentElement.dataset.worldQuality = next;
    const detail = { previous, profile: next, ...evidence };
    for (const fn of listeners) {
      try { fn(detail); } catch {}
    }
    dispatchEvent(new CustomEvent('worldserver:quality-profile', { detail }));
  }

  function registerQualityAdapter(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    try { fn({ previous: null, profile: state.profile, initial: true }); } catch {}
    return () => listeners.delete(fn);
  }

  function registerRenderer(renderer, options = {}) {
    if (!renderer) return () => {};
    const cleanups = [];
    if (window.GoldenPerformanceAutoTune?.registerRenderer) {
      try { cleanups.push(window.GoldenPerformanceAutoTune.registerRenderer(renderer, options)); } catch {}
    }
    if (window.WorldServerGraphicsQuality?.registerRenderer) {
      try { cleanups.push(window.WorldServerGraphicsQuality.registerRenderer(renderer, options)); } catch {}
    }
    const cleanup = () => {
      for (const fn of cleanups) { try { fn?.(); } catch {} }
      rendererCleanups.delete(cleanup);
    };
    rendererCleanups.add(cleanup);
    return cleanup;
  }

  let deferredInstallPrompt = null;
  addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    post('pwa_install_available', { message: 'beforeinstallprompt' });
  });

  addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    post('pwa_installed', { message: 'installed' });
  });

  async function install() {
    if (!deferredInstallPrompt) return false;
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      return choice?.outcome === 'accepted';
    } catch {
      return false;
    }
  }

  async function updateServiceWorker(registration) {
    if (!registration || navigator.onLine === false || document.visibilityState !== 'visible') return;
    try { await registration.update(); } catch {}
  }

  if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        state.serviceWorker = 'registered';
        post('pwa_runtime', { message: `sw=registered;standalone=${standalone ? 1 : 0}` });
        updateServiceWorker(registration);

        const timer = setInterval(() => updateServiceWorker(registration), 6 * 60 * 60 * 1000);
        addEventListener('pagehide', () => clearInterval(timer), { once: true });

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') updateServiceWorker(registration);
        });

        registration.addEventListener('updatefound', () => {
          post('pwa_update_found', { message: 'service-worker-update' });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          state.serviceWorker = 'active';
          post('pwa_update_active', { message: 'new-controller' });
        });
      })
      .catch(error => {
        state.serviceWorker = 'failed';
        post('pwa_runtime_error', { message: String(error?.message || error).slice(0, 220) });
      });
  }

  const frameDurations = [];
  const inputLatencies = [];
  let longTaskMs = 0;
  let lastFrame = performance.now();
  let frames = 0;
  let windowStarted = lastFrame;
  let lastProfileChange = 0;
  let lastTelemetry = 0;
  let pendingProfile = state.profile;
  let pendingProfileWindows = 0;

  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) longTaskMs += Math.max(0, Number(entry.duration) || 0);
    });
    observer.observe({ entryTypes: ['longtask'] });
  } catch {}
  try {
    const eventObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const delay = Number(entry.processingStart) - Number(entry.startTime);
        if (Number.isFinite(delay) && delay >= 0) {
          inputLatencies.push(delay);
          if (inputLatencies.length > 120) inputLatencies.shift();
        }
      }
    });
    eventObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {}

  function captureInputLatency() {
    const started = performance.now();
    requestAnimationFrame(now => {
      const latency = Math.max(0, now - started);
      inputLatencies.push(latency);
      if (inputLatencies.length > 120) inputLatencies.shift();
    });
  }

  for (const type of ['pointerdown', 'touchstart', 'keydown']) {
    addEventListener(type, captureInputLatency, { passive: true, capture: true });
  }

  function chooseProfile(fps, p95Frame, jank) {
    const coarse = matchMedia('(pointer:coarse)').matches;
    if (fps < 28 || p95Frame > 55 || jank > 0.28) return 'performance';
    if (fps < (coarse ? 42 : 48) || p95Frame > 38 || jank > 0.16) return 'balanced';
    if (fps > 56 && p95Frame < 22 && jank < 0.06) return 'ultra';
    return 'high';
  }

  function sample(now) {
    const dt = Math.max(0, now - lastFrame);
    lastFrame = now;
    frames++;
    frameDurations.push(dt);
    if (frameDurations.length > 240) frameDurations.shift();

    if (now - windowStarted >= 5000) {
      const elapsed = Math.max(1, now - windowStarted);
      const fps = Math.round(frames * 1000 / elapsed);
      const p95Frame = Math.round(percentile(frameDurations, 0.95) || 0);
      const janky = frameDurations.filter(value => value > 34).length;
      const jank = frameDurations.length ? janky / frameDurations.length : 0;
      const inputP95 = Math.round(percentile(inputLatencies, 0.95) || 0);
      const candidate = chooseProfile(fps, p95Frame, jank);
      if (candidate === pendingProfile) pendingProfileWindows++;
      else { pendingProfile = candidate; pendingProfileWindows = 1; }
      const rank = { performance: 0, balanced: 1, high: 2, ultra: 3 };
      const downgrade = rank[candidate] < rank[state.profile];
      const requiredWindows = downgrade ? 2 : 4;
      const next = pendingProfileWindows >= requiredWindows ? candidate : state.profile;

      state.fps = fps;
      state.frameP95Ms = p95Frame;
      state.animationJankRate = Number(jank.toFixed(3));
      state.inputLatencyP95Ms = inputP95;
      state.longTaskMs = Math.round(longTaskMs);

      if (now - lastProfileChange > 15000 && next !== state.profile) {
        emitProfile(next, { fps, frameP95Ms: p95Frame, animationJankRate: state.animationJankRate });
        lastProfileChange = now;
      }

      if (now - lastTelemetry >= 30000) {
        const compact = JSON.stringify({
          i: inputP95,
          f: p95Frame,
          j: Number(jank.toFixed(3)),
          l: Math.min(99999, Math.round(longTaskMs)),
          q: state.profile,
          s: standalone ? 1 : 0
        });
        post('pwa_quality', {
          fps,
          coarse: matchMedia('(pointer:coarse)').matches,
          frameP95Ms: p95Frame,
          inputLatencyP95Ms: inputP95,
          jankRate: Number(jank.toFixed(3)),
          longTaskMs: Math.round(longTaskMs),
          qualityProfile: state.profile,
          capabilityClass: window.WorldServerDeviceQuality?.state?.capabilityClass || null,
          heapMb: window.WorldServerDeviceQuality?.state?.jsHeapMb ?? null,
          webglContextLosses: window.WorldServerDeviceQuality?.state?.webglContextLosses ?? null,
          iosWebkit,
          standalonePwa: standalone,
          message: compact
        });
        lastTelemetry = now;
        longTaskMs = 0;
      }

      frames = 0;
      windowStarted = now;
    }

    requestAnimationFrame(sample);
  }

  requestAnimationFrame(sample);


  addEventListener('worldserver:server-quality-recommendation', event => {
    const recommendation = event.detail || {};
    state.serverRecommendation = recommendation;
    const next = recommendation.profile;
    const confidence = recommendation.confidence;
    if (!['performance','balanced','high','ultra'].includes(next) || !['medium','high'].includes(confidence)) return;
    const rank = { performance:0, balanced:1, high:2, ultra:3 };
    if (rank[next] < rank[state.profile]) emitProfile(next, { source:'server-quality-learning', confidence, samples:recommendation.evidence?.samples || 0 });
    else if (rank[next] > rank[state.profile] && confidence === 'high' && Number(state.fps || 0) >= 56 && Number(state.frameP95Ms || 999) < 22) {
      emitProfile(next, { source:'server-quality-learning-promotion', confidence, samples:recommendation.evidence?.samples || 0 });
    }
  });

  addEventListener('online', () => {
    state.online = true;
    dispatchEvent(new CustomEvent('worldserver:connectivity', { detail: { online: true } }));
  });
  addEventListener('offline', () => {
    state.online = false;
    dispatchEvent(new CustomEvent('worldserver:connectivity', { detail: { online: false } }));
  });

  window.WorldServerPWA = Object.freeze({
    state,
    install,
    registerRenderer,
    registerQualityAdapter,
    get isStandalone() { return standalone; }
  });

  document.documentElement.dataset.worldQuality = state.profile;
  post('pwa_launch', { message: `standalone=${standalone ? 1 : 0}` });
})();
