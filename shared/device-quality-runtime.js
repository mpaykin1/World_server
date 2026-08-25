'use strict';

(function () {
  if (window.__WORLD_SERVER_DEVICE_QUALITY__) return;
  window.__WORLD_SERVER_DEVICE_QUALITY__ = true;

  const endpoint = '/api/quality-telemetry';
  const app = (location.pathname.match(/\/apps\/([^/]+)/) || [])[1] || 'unknown';
  const state = {
    hardwareConcurrency: Number(navigator.hardwareConcurrency || 0) || null,
    deviceMemoryGb: Number(navigator.deviceMemory || 0) || null,
    saveData: Boolean(navigator.connection?.saveData),
    effectiveType: navigator.connection?.effectiveType || null,
    batteryLevel: null,
    charging: null,
    webglVersion: 0,
    maxTextureSize: null,
    maxRenderbufferSize: null,
    maxTextureUnits: null,
    maxAnisotropy: null,
    gpuVendor: null,
    gpuRenderer: null,
    jsHeapMb: null,
    webglContextLosses: 0,
    thermalPressure: 0,
    powerPressure: 0,
    capabilityClass: 'unknown',
    iosWebkit: /iP(?:hone|ad|od)/i.test(String(navigator.userAgent || '')),
    serverRecommendation: null
  };

  function post(type, data = {}) {
    const payload = JSON.stringify({ type, app, path: location.pathname, ts: Date.now(), ...data });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      else fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
    } catch {}
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function detectGpu() {
    const canvas = document.createElement('canvas');
    let gl = null;
    try { gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' }); } catch {}
    if (gl) state.webglVersion = 2;
    if (!gl) {
      try { gl = canvas.getContext('webgl', { powerPreference: 'high-performance' }) || canvas.getContext('experimental-webgl'); } catch {}
      if (gl) state.webglVersion = 1;
    }
    if (!gl) return;

    try { state.maxTextureSize = safeNumber(gl.getParameter(gl.MAX_TEXTURE_SIZE)); } catch {}
    try { state.maxRenderbufferSize = safeNumber(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)); } catch {}
    try { state.maxTextureUnits = safeNumber(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)); } catch {}
    try {
      const ext = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
      if (ext) state.maxAnisotropy = safeNumber(gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT));
    } catch {}
    try {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (debug) {
        state.gpuVendor = String(gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '').slice(0, 96) || null;
        state.gpuRenderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '').slice(0, 128) || null;
      }
    } catch {}
  }

  function classify() {
    let score = 0;
    if ((state.hardwareConcurrency || 0) >= 8) score += 2;
    else if ((state.hardwareConcurrency || 0) >= 4) score += 1;
    if ((state.deviceMemoryGb || 0) >= 8) score += 2;
    else if ((state.deviceMemoryGb || 0) >= 4) score += 1;
    if ((state.maxTextureSize || 0) >= 16384) score += 2;
    else if ((state.maxTextureSize || 0) >= 8192) score += 1;
    if (state.webglVersion >= 2) score += 1;
    if (state.saveData) score -= 2;
    if (state.powerPressure >= 0.6) score -= 1;
    if (state.thermalPressure >= 0.8) score -= 2;
    if (state.effectiveType === '2g' || state.effectiveType === 'slow-2g') score -= 1;
    state.capabilityClass = score >= 6 ? 'ultra' : score >= 4 ? 'high' : score >= 2 ? 'balanced' : 'performance';
  }

  let lastRecommendationAt = 0;
  async function fetchServerRecommendation() {
    if (!state.capabilityClass || state.capabilityClass === 'unknown' || navigator.onLine === false) return;
    if (Date.now() - lastRecommendationAt < 30 * 60 * 1000) return;
    lastRecommendationAt = Date.now();
    try {
      const r = await fetch(`/api/quality-profile?app=${encodeURIComponent(app)}&capability=${encodeURIComponent(state.capabilityClass)}`, { cache:'no-store' });
      const j = await r.json();
      if (!r.ok || j.ok !== true) return;
      state.serverRecommendation = { profile:j.profile, confidence:j.confidence, evidence:j.evidence };
      dispatchEvent(new CustomEvent('worldserver:server-quality-recommendation', { detail: state.serverRecommendation }));
    } catch {}
  }

  function emit() {
    try {
      const used = Number(performance.memory?.usedJSHeapSize || 0);
      state.jsHeapMb = used > 0 ? Math.round(used / 104857.6) / 10 : null;
    } catch {}
    classify();
    const detail = { ...state };
    dispatchEvent(new CustomEvent('worldserver:device-capability', { detail }));
    const compact = {
      c: state.capabilityClass,
      hc: state.hardwareConcurrency,
      dm: state.deviceMemoryGb,
      sd: state.saveData ? 1 : 0,
      et: state.effectiveType,
      w: state.webglVersion,
      tx: state.maxTextureSize,
      rb: state.maxRenderbufferSize,
      tu: state.maxTextureUnits,
      an: state.maxAnisotropy,
      hm: state.jsHeapMb,
      cl: state.webglContextLosses,
      th: Number(state.thermalPressure.toFixed(3)),
      pp: Number(state.powerPressure.toFixed(3)),
      iw: state.iosWebkit ? 1 : 0
    };
    post('pwa_device', {
      message: JSON.stringify(compact),
      coarse: matchMedia('(pointer:coarse)').matches,
      capabilityClass: state.capabilityClass,
      heapMb: state.jsHeapMb,
      webglContextLosses: state.webglContextLosses,
      iosWebkit: state.iosWebkit,
      standalonePwa: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    });
    fetchServerRecommendation();
  }

  async function initBattery() {
    if (typeof navigator.getBattery !== 'function') return;
    try {
      const battery = await navigator.getBattery();
      const sync = () => {
        state.batteryLevel = safeNumber(battery.level);
        state.charging = Boolean(battery.charging);
        const lowBattery = state.batteryLevel !== null && state.batteryLevel < 0.2 && !state.charging;
        state.powerPressure = lowBattery ? Math.max(state.powerPressure, 0.65) : Math.min(state.powerPressure, 0.2);
        emit();
      };
      sync();
      battery.addEventListener?.('levelchange', sync);
      battery.addEventListener?.('chargingchange', sync);
    } catch {}
  }

  let badWindows = 0;
  let goodWindows = 0;
  addEventListener('worldserver:quality-profile', event => {
    const profile = event.detail?.profile;
    const fps = Number(event.detail?.fps || window.WorldServerPWA?.state?.fps || 0);
    const frame = Number(event.detail?.frameP95Ms || window.WorldServerPWA?.state?.frameP95Ms || 0);
    const stressed = profile === 'performance' || fps < 28 || frame > 55;
    if (stressed) {
      badWindows++;
      goodWindows = 0;
    } else {
      goodWindows++;
      badWindows = Math.max(0, badWindows - 1);
    }
    if (badWindows >= 3) state.thermalPressure = Math.min(1, state.thermalPressure + 0.18);
    else if (goodWindows >= 3) state.thermalPressure = Math.max(0, state.thermalPressure - 0.08);
    if (state.thermalPressure > 0.55) {
      dispatchEvent(new CustomEvent('worldserver:thermal-proxy', { detail: { pressure: state.thermalPressure, source: 'sustained-frame-pressure' } }));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') state.thermalPressure = Math.max(0, state.thermalPressure - 0.06);
  });

  navigator.connection?.addEventListener?.('change', emit);
  document.addEventListener('webglcontextlost', () => { state.webglContextLosses++; emit(); }, true);
  detectGpu();
  initBattery().finally(() => emit());
  setInterval(emit, 5 * 60 * 1000);

  window.WorldServerDeviceQuality = Object.freeze({
    state,
    snapshot: () => ({ ...state })
  });
})();
