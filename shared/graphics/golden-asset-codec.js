(function (global) {
  'use strict';
  // Shared lazy KTX2/BasisU + Meshopt bridge. PARTIAL capability: optional,
  // cached, fail-soft. Never auto-invoked on mobile/lowPower — callers decide.
  const THREE_VERSION = '0.165.0';
  const BASE = `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/`;
  const KTX2_URL = `${BASE}loaders/KTX2Loader.js`;
  const MESHOPT_URL = `${BASE}libs/meshopt_decoder.module.js`;
  const TRANSCODER_PATH = `${BASE}libs/basis/`;

  const state = {
    ktx2: { promise: null, loader: null, supported: null, attempted: false, error: null },
    meshopt: { promise: null, decoder: null, attempted: false, error: null },
    prewarmed: false
  };

  function importModule(url) {
    return import(url);
  }

  function createKTX2Loader(renderer, options) {
    if (state.ktx2.promise) return state.ktx2.promise;
    state.ktx2.attempted = true;
    state.ktx2.promise = importModule(KTX2_URL).then((mod) => {
      const KTX2Loader = mod && mod.KTX2Loader;
      if (!KTX2Loader) throw new Error('KTX2Loader export missing');
      const loader = new KTX2Loader();
      loader.setTranscoderPath((options && options.transcoderPath) || TRANSCODER_PATH);
      if (renderer) {
        try {
          loader.detectSupport(renderer);
          state.ktx2.supported = true;
        } catch (error) {
          state.ktx2.supported = false;
        }
      }
      state.ktx2.loader = loader;
      return loader;
    }).catch((error) => {
      state.ktx2.error = String((error && error.message) || error);
      state.ktx2.loader = null;
      return null;
    });
    return state.ktx2.promise;
  }

  function getMeshoptDecoder() {
    if (state.meshopt.promise) return state.meshopt.promise;
    state.meshopt.attempted = true;
    state.meshopt.promise = importModule(MESHOPT_URL).then((mod) => {
      const decoder = mod && mod.MeshoptDecoder;
      if (!decoder) throw new Error('MeshoptDecoder export missing');
      state.meshopt.decoder = decoder;
      return decoder;
    }).catch((error) => {
      state.meshopt.error = String((error && error.message) || error);
      state.meshopt.decoder = null;
      return null;
    });
    return state.meshopt.promise;
  }

  function prewarm(options) {
    if (state.prewarmed) return;
    state.prewarmed = true;
    try { createKTX2Loader(options && options.renderer, options).catch(() => {}); } catch (error) { /* offline-safe */ }
    try { getMeshoptDecoder().catch(() => {}); } catch (error) { /* offline-safe */ }
  }

  function diagnostics() {
    return {
      threeVersion: THREE_VERSION,
      ktx2: {
        attempted: state.ktx2.attempted,
        ready: Boolean(state.ktx2.loader),
        supported: state.ktx2.supported,
        error: state.ktx2.error
      },
      meshopt: {
        attempted: state.meshopt.attempted,
        ready: Boolean(state.meshopt.decoder),
        error: state.meshopt.error
      },
      prewarmed: state.prewarmed
    };
  }

  const api = { createKTX2Loader, getMeshoptDecoder, prewarm, diagnostics, THREE_VERSION };
  global.GoldenAssetCodec = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
