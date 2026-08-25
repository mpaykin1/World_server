'use strict';

(function () {
  if (window.__WORLD_SERVER_ASSET_DELIVERY__) return;
  window.__WORLD_SERVER_ASSET_DELIVERY__ = true;

  const app = (location.pathname.match(/\/apps\/([^/]+)/) || [])[1] || 'unknown';
  const maxWarmBytes = matchMedia('(pointer:coarse)').matches ? 12 * 1024 * 1024 : 24 * 1024 * 1024;
  const saveData = Boolean(navigator.connection?.saveData);
  const slowNetwork = /(^|-)2g$/.test(String(navigator.connection?.effectiveType || ''));
  let cancelled = false;
  let derivedMap = null;

  async function loadDerivedMap() {
    if (derivedMap) return derivedMap;
    try {
      const r = await fetch('/data/derived-asset-map.json', { cache: 'no-store' });
      derivedMap = r.ok ? await r.json() : { assets: {} };
    } catch { derivedMap = { assets: {} }; }
    return derivedMap;
  }

  async function resolveAsync(url) {
    const map = await loadDerivedMap();
    return map?.assets?.[url] || url;
  }
  function resolve(url) {
    return derivedMap?.assets?.[url] || url;
  }

  async function warm() {
    if (cancelled || saveData || slowNetwork || navigator.onLine === false) return;
    let manifest;
    try {
      const response = await fetch('/data/runtime-asset-manifest.json', { cache: 'no-store' });
      if (!response.ok) return;
      manifest = await response.json();
    } catch { return; }
    const candidates = [
      ...(manifest.perApp?.[app] || []),
      ...(manifest.shared || [])
    ].filter(x => x && x.url && Number(x.bytes) > 0 && Number(x.bytes) <= 8 * 1024 * 1024);
    let total = 0;
    for (const item of candidates) {
      if (cancelled || total + item.bytes > maxWarmBytes) break;
      try {
        const target = await resolveAsync(item.url);
        const r = await fetch(target, { cache: 'force-cache', priority: 'low' });
        if (r.ok) total += item.bytes;
      } catch {}
    }
    dispatchEvent(new CustomEvent('worldserver:asset-warm', { detail: { app, bytes: total, count: candidates.length } }));
  }

  const schedule = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => warm(), { timeout: 5000 });
    else setTimeout(warm, 2500);
  };
  addEventListener('pagehide', () => { cancelled = true; }, { once: true });
  if (document.readyState === 'complete') schedule();
  else addEventListener('load', schedule, { once: true });

  loadDerivedMap();
  window.WorldServerAssetDelivery = Object.freeze({ warmNow: warm, resolve, resolveAsync, loadDerivedMap });
})();
