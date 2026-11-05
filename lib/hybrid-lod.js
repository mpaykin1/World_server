'use strict';
// GRAF HybridLOD: чистая (без Three.js) логика выбора уровня 3D / 2.5D / 2D.
// Один identity на сущность, фаза анимации не сбрасывается при смене уровня,
// гистерезис и бюджет устройства предотвращают мерцание переключений.

const TIERS = ['3d', '2.5d', '2d', 'culled'];

// Экранная важность: угловой размер, усиленный приоритетом (герой/враг в бою).
function importance(entity, camPos, fovY, viewportH) {
  const dx = entity.x - camPos.x, dy = entity.y - camPos.y, dz = entity.z - camPos.z;
  const dist = Math.max(0.001, Math.hypot(dx, dy, dz));
  const px = (entity.radius * 2 / (2 * dist * Math.tan(fovY / 2))) * viewportH;
  return px * (entity.priority || 1);
}

const DEFAULT_CFG = {
  near3d: 120,     // px: выше — полноценная 3D-модель
  mid25d: 28,      // px: выше — 2.5D спрайт из 8 направлений
  far2d: 4,        // px: выше — 2D иконка/атлас, ниже — culled
  hysteresis: 0.2, // доля порога, нужная для возврата на уровень выше
  minDwell: 0.25,  // сек: не переключать чаще
};

function createHybridLOD(cfg) {
  const c = Object.assign({}, DEFAULT_CFG, cfg);
  const state = new Map(); // id -> { tier, since, phase }

  function raw(imp, scale) {
    if (imp >= c.near3d * scale) return 0;
    if (imp >= c.mid25d * scale) return 1;
    if (imp >= c.far2d * scale) return 2;
    return 3;
  }

  // budgetScale > 1 (слабое устройство) поднимает пороги: меньше 3D.
  function update(entity, imp, t, dt, budgetScale) {
    const scale = budgetScale || 1;
    let s = state.get(entity.id);
    if (!s) {
      s = { tier: raw(imp, scale), since: t, phase: entity.phase || 0 };
      state.set(entity.id, s);
    }
    // Единые часы анимации: фаза течёт независимо от уровня.
    s.phase = (s.phase + dt * (entity.animSpeed || 1)) % 1;

    const want = raw(imp, scale);
    if (want !== s.tier && t - s.since >= c.minDwell) {
      if (want > s.tier) {
        s.tier = want; s.since = t; // понижение детализации — сразу после dwell
      } else {
        // повышение требует запас по гистерезису над порогом уровня want
        const thr = [c.near3d, c.mid25d, c.far2d][want] * scale;
        if (imp >= thr * (1 + c.hysteresis)) { s.tier = want; s.since = t; }
      }
    }
    return { id: entity.id, tier: TIERS[s.tier], phase: s.phase, importance: imp };
  }

  return {
    update,
    forget(id) { state.delete(id); },
    size() { return state.size; },
    counts() {
      const r = { '3d': 0, '2.5d': 0, '2d': 0, culled: 0 };
      for (const s of state.values()) r[TIERS[s.tier]]++;
      return r;
    },
  };
}

module.exports = { createHybridLOD, importance, DEFAULT_CFG, TIERS };
