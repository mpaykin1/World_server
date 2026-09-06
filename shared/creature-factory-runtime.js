(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreatureFactoryRuntime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : this;
  if (G.CreatureFactoryRuntime) return G.CreatureFactoryRuntime;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function registerRenderer(renderer, opts = {}) {
    const qa = G.WorldQualityAutopilot;
    if (qa && qa.registerRenderer && renderer)
      return qa.registerRenderer(opts.appId || 'creature-factory', renderer, opts.options || {});
    return null;
  }

  function createLodAdapter(category, params) {
    const auto = G.GoldenPerformanceAutoTune;
    if (auto && auto.registerRenderer) return { autotune: true };
    return { lodBias: clamp(params && params.lodBias !== undefined ? params.lodBias : 1, 0.4, 1), detailLevel: params && params.detailLevel || 'mid', category };
  }

  function telemetry(label, data) {
    const t = G.CreatureFactoryTelemetry;
    if (t && t.record) t.record(label, data);
  }

  function animateAsset(hierarchy, params) {
    const motion = G.GameMotionEngine;
    if (!motion || !motion.MotionScheduler) return null;
    const scheduler = new motion.MotionScheduler({ hz: Math.max(10, Math.round((params.animationBudget || 1) * 60)) });
    const controllers = [];
    const parts = hierarchy && hierarchy.parts || [];
    for (const part of parts) {
      if (part.name === 'tail' || (part.name && part.name.startsWith('wing'))) {
        if (part.rot && part.baseRotX === undefined) part.baseRotX = part.rot.x || 0;
        const c = scheduler.add({
          phase: Math.random() * Math.PI * 2,
          step(dt) {
            this.phase = (this.phase + dt * 1.2) % (Math.PI * 2);
            if (part.rot && part.rot.x !== undefined) part.rot.x = part.baseRotX + Math.sin(this.phase) * 0.25;
          }
        });
        controllers.push(c);
      }
    }
    scheduler.start();
    return { scheduler, controllers, dispose() { controllers.forEach(c => c.dispose && c.dispose()); } };
  }

  function buildFootController(params) {
    const loco = G.WorldProceduralLocomotion;
    if (!loco || !loco.createController) return null;
    const p = params || { stepHeight: .14, stride: .28, speed: 1 };
    return loco.createController({ stepHeight: p.stepHeight || .14, stride: p.stride || .28, speed: p.speed != null ? p.speed : 1 });
  }

  function humanoidBalance(pose) {
    const h = G.WorldProceduralHumanoid;
    if (!h || !h.balance || !h.centerOfMass) return { stable: true };
    return h.balance(pose);
  }

  function materialSample(kind, u, v, t) {
    const m = G.WorldProceduralMaterials;
    if (m && m.sample) return m.sample(kind, u, v, t);
    return { albedo: [.5, .5, .5], roughness: .5, metalness: 0, height: 0 };
  }

  G.CreatureFactoryRuntime = {
    version: '1.0.0',
    registerRenderer,
    createLodAdapter,
    telemetry,
    animateAsset,
    buildFootController,
    humanoidBalance,
    materialSample
  };
  return G.CreatureFactoryRuntime;
});
