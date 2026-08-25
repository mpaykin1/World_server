'use strict';

const VERSION = 'world-server-pwa-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const MEDIA_CACHE = `${VERSION}-media`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = '/offline.html';
const MAX_SINGLE_ASSET_BYTES = 96 * 1024 * 1024;

const PRECACHE = [
  OFFLINE_URL,
  '/shared/pwa-runtime.js',
  '/shared/device-quality-runtime.js',
  '/shared/graphics-quality-controller.js',
  '/shared/frame-stutter-profiler.js',
  '/shared/predictive-streaming-runtime.js',
  '/shared/asset-delivery-runtime.js',
  '/shared/animation-quality-validator.js',
  '/shared/rig-adapters.js',
  '/shared/quality-telemetry.js',
  '/shared/golden-performance-autotuner.js',
  '/shared/pwa-icon-180.png',
  '/shared/pwa-icon-192.png',
  '/shared/pwa-icon-512.png'
];

const LIMITS = Object.freeze({
  [RUNTIME_CACHE]: 100,
  [MEDIA_CACHE]: 140,
  [ASSET_CACHE]: 48
});

async function trimCache(cacheName) {
  const max = LIMITS[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map(key => cache.delete(key)));
}

async function safePut(cacheName, request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  if (cacheName === ASSET_CACHE) {
    const length = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_SINGLE_ASSET_BYTES) return;
  }
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone()).catch(() => {});
  await trimCache(cacheName).catch(() => {});
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, MEDIA_CACHE, ASSET_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('world-server-pwa-') && !keep.has(name)).map(name => caches.delete(name)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'TRIM_CACHES') {
    event.waitUntil(Promise.all(Object.keys(LIMITS).map(trimCache)));
  }
});

async function networkFirst(request, cacheName, fallback, preloadResponse) {
  const cache = await caches.open(cacheName);
  try {
    const preload = await preloadResponse;
    if (preload) {
      safePut(cacheName, request, preload).catch(() => {});
      return preload;
    }
    const response = await fetch(request);
    safePut(cacheName, request, response).catch(() => {});
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: false });
    if (cached) return cached;
    if (fallback) {
      const offline = await caches.match(fallback);
      if (offline) return offline;
    }
    throw new Error('offline');
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    safePut(cacheName, request, response).catch(() => {});
    return response;
  }).catch(() => null);
  return cached || await network || Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API/auth/realtime data is always network-owned and never cached by the PWA shell.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, OFFLINE_URL, event.preloadResponse));
    return;
  }

  const ext = (url.pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'svg', 'ico', 'woff', 'woff2'].includes(ext)) {
    event.respondWith(staleWhileRevalidate(request, MEDIA_CACHE));
    return;
  }
  if (['glb', 'gltf', 'bin', 'ktx2', 'basis', 'pck', 'ogg', 'mp3', 'wav', 'm4a', 'ply', 'spz'].includes(ext)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }
  if (url.pathname === '/data/runtime-asset-manifest.json' || url.pathname === '/data/derived-asset-map.json') {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  if (['js', 'mjs', 'css', 'json', 'wasm', 'html'].includes(ext)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
  }
});
