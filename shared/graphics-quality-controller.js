'use strict';

(function () {
  if (window.__WORLD_SERVER_GRAPHICS_QUALITY__) return;
  window.__WORLD_SERVER_GRAPHICS_QUALITY__ = true;

  const profiles = Object.freeze({
    performance: Object.freeze({ pixelRatioScale: 0.72, lodBias: 1.5, shadowScale: 0.65, particleScale: 0.55, effectScale: 0.7, textureBias: 1, anisotropy: 2, streamingRadiusScale: 0.7 }),
    balanced: Object.freeze({ pixelRatioScale: 0.86, lodBias: 1.2, shadowScale: 0.8, particleScale: 0.78, effectScale: 0.85, textureBias: 0.5, anisotropy: 4, streamingRadiusScale: 0.85 }),
    high: Object.freeze({ pixelRatioScale: 1, lodBias: 1, shadowScale: 1, particleScale: 1, effectScale: 1, textureBias: 0, anisotropy: 8, streamingRadiusScale: 1 }),
    ultra: Object.freeze({ pixelRatioScale: 1, lodBias: 0.82, shadowScale: 1.18, particleScale: 1.12, effectScale: 1.1, textureBias: -0.25, anisotropy: 16, streamingRadiusScale: 1.15 })
  });

  const adapters = new Set();
  const renderers = new Map();
  let capabilityClass = window.WorldServerDeviceQuality?.state?.capabilityClass || 'unknown';
  let current = window.WorldServerPWA?.state?.profile || 'high';
  let serverCeiling = null;

  function clampProfile(profile) {
    if (!profiles[profile]) profile = 'high';
    const rank = { performance: 0, balanced: 1, high: 2, ultra: 3 };
    if (capabilityClass !== 'unknown' && rank[profile] > rank[capabilityClass]) profile = capabilityClass;
    if (serverCeiling && rank[profile] > rank[serverCeiling]) profile = serverCeiling;
    return profile;
  }

  function applyRenderer(renderer, options, profileName) {
    const p = profiles[profileName];
    const baseDpr = Math.max(0.5, Math.min(Number(options.maxDpr || 2), Number(devicePixelRatio || 1)));
    const minDpr = Number(options.minDpr || 0.65);
    const nextDpr = Math.max(minDpr, Math.min(Number(options.maxDpr || 2), baseDpr * p.pixelRatioScale));
    try { renderer.setPixelRatio?.(nextDpr); } catch {}
    try {
      if (options.resize !== false && renderer.setSize) renderer.setSize(innerWidth, innerHeight, false);
    } catch {}
    try {
      if (renderer.shadowMap && options.preserveShadowState !== false && typeof options.initialShadowEnabled === 'boolean') renderer.shadowMap.enabled = options.initialShadowEnabled;
    } catch {}
    try { renderer.outputColorSpace = renderer.outputColorSpace; } catch {}
    return nextDpr;
  }

  function apply(profile, evidence = {}) {
    current = clampProfile(profile);
    document.documentElement.dataset.worldGraphicsQuality = current;
    const settings = profiles[current];

    for (const [renderer, options] of renderers.entries()) {
      const pixelRatio = applyRenderer(renderer, options, current);
      options.onApplied?.({ profile: current, settings, pixelRatio, evidence });
    }
    for (const adapter of adapters) {
      try { adapter({ profile: current, settings, evidence }); } catch {}
    }
    dispatchEvent(new CustomEvent('worldserver:graphics-quality', { detail: { profile: current, settings, evidence } }));
  }

  function registerRenderer(renderer, options = {}) {
    if (!renderer) return () => {};
    renderers.set(renderer, { ...options, initialShadowEnabled: typeof renderer.shadowMap?.enabled === 'boolean' ? renderer.shadowMap.enabled : undefined });
    apply(current, { source: 'register-renderer' });
    return () => renderers.delete(renderer);
  }

  function registerAdapter(adapter) {
    if (typeof adapter !== 'function') return () => {};
    adapters.add(adapter);
    try { adapter({ profile: current, settings: profiles[current], evidence: { source: 'register-adapter' } }); } catch {}
    return () => adapters.delete(adapter);
  }

  addEventListener('worldserver:quality-profile', event => apply(event.detail?.profile || current, event.detail || {}));
  addEventListener('worldserver:device-capability', event => {
    capabilityClass = event.detail?.capabilityClass || 'unknown';
    apply(current, { source: 'device-capability', capabilityClass });
  });
  addEventListener('worldserver:server-quality-recommendation', event => {
    const d = event.detail || {};
    if (['medium','high'].includes(d.confidence) && profiles[d.profile]) {
      serverCeiling = d.profile;
      apply(current, { source:'server-quality-ceiling', confidence:d.confidence });
    }
  });
  addEventListener('worldserver:thermal-proxy', event => {
    const pressure = Number(event.detail?.pressure || 0);
    if (pressure >= 0.8) apply('performance', { source: 'thermal-proxy', pressure });
    else if (pressure >= 0.55 && current === 'ultra') apply('high', { source: 'thermal-proxy', pressure });
  });
  addEventListener('worldserver:device-capability', event => {
    const power = Number(event.detail?.powerPressure || 0);
    if (power >= 0.65 && (current === 'ultra' || current === 'high')) apply('balanced', { source: 'power-pressure', powerPressure: power });
  });

  window.WorldServerGraphicsQuality = Object.freeze({
    profiles,
    registerRenderer,
    registerAdapter,
    apply,
    get profile() { return current; }
  });

  apply(current, { source: 'startup' });
})();
