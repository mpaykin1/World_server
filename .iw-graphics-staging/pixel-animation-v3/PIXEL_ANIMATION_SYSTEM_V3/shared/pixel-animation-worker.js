'use strict';
let engine = null;
let ready = false;
let statsTimer = 0;

function reply(type, payload) { self.postMessage({ type, ...(payload || {}) }); }
function fail(error) { reply('error', { message: error instanceof Error ? error.message : String(error) }); }

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === 'init') {
      if (!msg.engineUrl) throw new Error('engineUrl is required');
      importScripts(msg.engineUrl);
      if (!self.PixelAnimation) throw new Error('PixelAnimation engine did not load');
      let config = { policy: msg.options && msg.options.policy, profiles: msg.options && msg.options.profiles };
      if (msg.configUrl) {
        try { config = await self.PixelAnimation.fetchConfig(msg.configUrl, { timeoutMs: msg.configTimeoutMs || 4000 }); }
        catch (error) { reply('warning', { message: `config fallback: ${error.message || error}` }); }
      }
      engine = self.PixelAnimation.create(msg.canvas, { ...(msg.options || {}), policy: config.policy, profiles: config.profiles });
      if (msg.atlasUrl) await engine.loadAtlas(msg.atlasUrl);
      if (msg.camera) engine.setCamera(msg.camera);
      engine.start(); ready = true;
      if (msg.statsIntervalMs) statsTimer = setInterval(() => { if (engine) reply('stats', { stats: engine.stats() }); }, Math.max(250, msg.statsIntervalMs));
      reply('ready', { version: self.PixelAnimation.VERSION, stats: engine.stats() }); return;
    }
    if (!ready || !engine) return;
    if (msg.type === 'spawn') { engine.spawn(msg.spec || {}); return; }
    if (msg.type === 'update') { engine.update(msg.id, msg.patch || {}); return; }
    if (msg.type === 'remove') { engine.remove(msg.id); return; }
    if (msg.type === 'clear') { engine.clear(); return; }
    if (msg.type === 'camera') { engine.setCamera(msg.camera || {}); return; }
    if (msg.type === 'resize') { engine.resize(msg.width, msg.height); return; }
    if (msg.type === 'profiles') { engine.setProfiles(msg.profiles || {}); return; }
    if (msg.type === 'policy') { engine.setPolicy(msg.policy || {}); return; }
    if (msg.type === 'pause') { engine.stop(); return; }
    if (msg.type === 'resume') { engine.start(); return; }
    if (msg.type === 'stats') { reply('stats', { requestId: msg.requestId, stats: engine.stats() }); return; }
    if (msg.type === 'destroy') { if (statsTimer) clearInterval(statsTimer); engine.destroy(); engine = null; ready = false; close(); }
  } catch (error) { fail(error); }
};
