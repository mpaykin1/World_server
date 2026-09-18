(() => {
  'use strict';

  const PHASER_VERSION = '4.2.1';
  const PHASER_CDN = `https://cdn.jsdelivr.net/npm/phaser@${PHASER_VERSION}/dist/phaser.min.js`;
  const ROOT_ID = 'phaser4FxLayer';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = matchMedia('(pointer: coarse)').matches;

  const state = {
    phase: reducedMotion ? 'disabled-reduced-motion' : 'idle',
    game: null,
    scene: null,
    loadPromise: null,
    events: 0,
    rendered: 0,
    dropped: 0,
    lastFps: 60,
    quality: 1,
    disabledUntil: 0
  };

  const queue = [];
  const baseQuality = (() => {
    const memory = Number(navigator.deviceMemory || 4);
    let q = coarsePointer ? 0.62 : 0.92;
    if (memory <= 2) q *= 0.72;
    else if (memory >= 8 && !coarsePointer) q = 1;
    return Math.max(0.32, Math.min(1, q));
  })();
  state.quality = baseQuality;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function toColor(value, fallback = 0xffffff) {
    const n = Number(value);
    return Number.isFinite(n) ? (n >>> 0) & 0xffffff : fallback;
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:34',
      'pointer-events:none',
      'overflow:hidden',
      'contain:strict'
    ].join(';');
    document.body.appendChild(root);
    return root;
  }

  function flushQueue() {
    if (!state.scene) return;
    while (queue.length) {
      const fn = queue.shift();
      try { fn(); } catch (error) { console.warn('[PHASER4 FX]', error?.message || error); }
    }
  }

  function initPhaser() {
    if (state.scene || reducedMotion) return state.scene;
    const Phaser = window.Phaser;
    if (!Phaser?.Game) throw new Error('Phaser 4 runtime unavailable after load');

    const root = ensureRoot();
    state.phase = 'initializing';

    state.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: root,
      width: Math.max(1, innerWidth),
      height: Math.max(1, innerHeight),
      transparent: true,
      render: {
        antialias: !coarsePointer,
        pixelArt: false,
        roundPixels: false
      },
      fps: {
        target: coarsePointer ? 45 : 60,
        smoothStep: true
      },
      scene: {
        create() {
          state.scene = this;
          state.phase = 'ready';
          const canvas = state.game?.canvas;
          if (canvas) {
            canvas.style.position = 'absolute';
            canvas.style.inset = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none';
          }
          window.dispatchEvent(new CustomEvent('world:technology-ready', {
            detail: { id: 'phaser4-fx', version: PHASER_VERSION }
          }));
          flushQueue();
        }
      }
    });

    const resize = () => {
      try { state.game?.scale?.resize?.(Math.max(1, innerWidth), Math.max(1, innerHeight)); } catch {}
    };
    addEventListener('resize', resize, { passive: true });
    return state.scene;
  }

  function loadPhaser() {
    if (reducedMotion) return Promise.resolve(null);
    if (state.scene) return Promise.resolve(state.scene);
    if (window.Phaser?.Game) {
      try { return Promise.resolve(initPhaser()); } catch (error) { return Promise.reject(error); }
    }
    if (state.loadPromise) return state.loadPromise;

    state.phase = 'loading';
    state.loadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-world-phaser4]');
      const script = existing || document.createElement('script');
      let timeout = 0;

      const cleanup = () => {
        clearTimeout(timeout);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };
      const onLoad = () => {
        cleanup();
        try { resolve(initPhaser()); }
        catch (error) {
          state.phase = 'failed';
          reject(error);
        }
      };
      const onError = () => {
        cleanup();
        state.phase = 'failed';
        state.dropped += 1;
        reject(new Error('Failed to load Phaser 4'));
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!existing) {
        script.src = PHASER_CDN;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.dataset.worldPhaser4 = PHASER_VERSION;
        document.head.appendChild(script);
      }
      timeout = setTimeout(onError, 15000);
    }).catch(error => {
      console.warn('[PHASER4 FX]', error?.message || error);
      return null;
    });

    return state.loadPromise;
  }

  function adaptQuality() {
    const fps = Number(state.game?.loop?.actualFps || 60);
    if (Number.isFinite(fps) && fps > 0) state.lastFps = fps;

    if (fps < 32) {
      state.quality = Math.max(0.28, state.quality * 0.72);
      state.disabledUntil = performance.now() + 2400;
      return false;
    }
    if (fps < 43) state.quality = Math.max(0.34, state.quality * 0.9);
    else if (fps > 54) state.quality = Math.min(baseQuality, state.quality + 0.02);
    return true;
  }

  function particleCount(intensity = 1) {
    const base = coarsePointer ? 6 : 11;
    return Math.max(3, Math.min(18, Math.round(base * state.quality * clamp(Number(intensity) || 1, 0.45, 1.8))));
  }

  function renderBurst(kind, detail = {}) {
    const scene = state.scene;
    if (!scene) return;
    const now = performance.now();
    if (now < state.disabledUntil) {
      state.dropped += 1;
      return;
    }
    if (!adaptQuality()) {
      state.dropped += 1;
      return;
    }

    const x = clamp(Number(detail.x) || innerWidth / 2, -32, innerWidth + 32);
    const y = clamp(Number(detail.y) || innerHeight / 2, -32, innerHeight + 32);
    const fallback = kind === 'place' ? 0xbfe8ff : kind === 'recovery' ? 0x9df5a6 : 0xffd27b;
    const color = toColor(detail.color, fallback);
    const intensity = clamp(Number(detail.intensity) || 1, 0.45, 1.8);
    const count = particleCount(intensity);

    if (kind === 'place' || kind === 'recovery') {
      const ring = scene.add.circle(x, y, kind === 'place' ? 8 : 5, color, 0.08)
        .setStrokeStyle(kind === 'place' ? 2 : 1.5, color, 0.76);
      scene.tweens.add({
        targets: ring,
        scaleX: kind === 'place' ? 4.4 : 3.2,
        scaleY: kind === 'place' ? 4.4 : 3.2,
        alpha: 0,
        duration: kind === 'place' ? 360 : 520,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy()
      });
    }

    for (let i = 0; i < count; i += 1) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.65;
      const distance = (kind === 'break' ? 44 : 34) * (0.65 + Math.random() * 0.75) * intensity;
      const radius = (kind === 'break' ? 2.2 : 1.8) + Math.random() * 2.6;
      const dot = scene.add.circle(
        x + (Math.random() - 0.5) * 7,
        y + (Math.random() - 0.5) * 7,
        radius,
        color,
        0.82
      );
      scene.tweens.add({
        targets: dot,
        x: x + Math.cos(a) * distance,
        y: y + Math.sin(a) * distance - (kind === 'break' ? 8 + Math.random() * 14 : 0),
        scaleX: 0.35,
        scaleY: 0.35,
        alpha: 0,
        duration: (kind === 'break' ? 330 : 430) + Math.random() * 180,
        ease: kind === 'break' ? 'Quad.easeOut' : 'Sine.easeOut',
        onComplete: () => dot.destroy()
      });
    }

    state.rendered += 1;
  }

  function emit(kind, detail = {}) {
    state.events += 1;
    if (reducedMotion) {
      state.dropped += 1;
      return;
    }
    const task = () => renderBurst(kind, detail);
    if (state.scene) task();
    else {
      if (queue.length < 12) queue.push(task);
      else state.dropped += 1;
      void loadPhaser();
    }
  }

  window.WorldPhaserFx = Object.freeze({
    version: PHASER_VERSION,
    emit,
    ensureReady: loadPhaser,
    setQuality(value) {
      state.quality = clamp(Number(value) || baseQuality, 0.25, 1);
    },
    stats() {
      return {
        version: PHASER_VERSION,
        phase: state.phase,
        ready: Boolean(state.scene),
        events: state.events,
        rendered: state.rendered,
        dropped: state.dropped,
        quality: Number(state.quality.toFixed(2)),
        fps: Number(state.lastFps.toFixed(1)),
        reducedMotion,
        renderer: state.game?.renderer?.type ?? null
      };
    }
  });

  addEventListener('world:science-domain', event => {
    const domain = event.detail?.domain;
    if (domain === 'recoveryAnimation') emit('recovery', { intensity: 0.8, color: 0x9df5a6 });
  });

  if (!reducedMotion) {
    const warm = () => void loadPhaser();
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 2600 });
    else setTimeout(warm, 1400);
  }
})();
