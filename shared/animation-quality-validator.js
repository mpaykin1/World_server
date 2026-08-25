'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldServerAnimationQuality = api.createRuntime(root);
})(typeof window !== 'undefined' ? window : null, function () {
  const RAD = 180 / Math.PI;
  function finite(n) { return Number.isFinite(Number(n)); }
  function vec(v) {
    if (!v) return null;
    if (Array.isArray(v) && v.length >= 3) return { x: Number(v[0]), y: Number(v[1]), z: Number(v[2]) };
    if (finite(v.x) && finite(v.y) && finite(v.z)) return { x: Number(v.x), y: Number(v.y), z: Number(v.z) };
    return null;
  }
  function len2(v) { return Math.hypot(v.x, v.z); }
  function yaw(v) { return Math.atan2(v.x, v.z); }
  function angleDeg(a, b) {
    const va = vec(a), vb = vec(b);
    if (!va || !vb || len2(va) < 1e-5 || len2(vb) < 1e-5) return null;
    let d = Math.abs(yaw(va) - yaw(vb));
    while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
    return d * RAD;
  }
  function distance(a, b) {
    const va = vec(a), vb = vec(b);
    if (!va || !vb) return null;
    return Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
  }
  function dot(a, b) {
    const va = vec(a), vb = vec(b);
    if (!va || !vb) return null;
    const la = Math.hypot(va.x, va.y, va.z), lb = Math.hypot(vb.x, vb.y, vb.z);
    if (la < 1e-5 || lb < 1e-5) return null;
    return (va.x * vb.x + va.y * vb.y + va.z * vb.z) / (la * lb);
  }

  function evaluate(sample, policy = {}) {
    const cfg = {
      footMoveAngleMax: 35,
      attackFootAngleMax: 25,
      weaponHandDistanceMax: 0.3,
      supportHandDistanceMax: 0.45,
      shieldTorsoDistanceMax: 0.9,
      shieldVerticalDotMin: 0.82,
      shieldFrontDotMin: 0.25,
      shieldCoverageMin: 0.68,
      ...policy
    };
    const violations = [];
    const movement = vec(sample.movementDirection);
    const feet = vec(sample.feetDirection);
    if (movement && len2(movement) > 0.05 && feet) {
      const deg = angleDeg(movement, feet);
      if (deg !== null && deg > cfg.footMoveAngleMax) violations.push({ id: 'feet-vs-movement', value: Math.round(deg), max: cfg.footMoveAngleMax });
    }
    const attack = vec(sample.attackDirection);
    if (attack && feet) {
      const deg = angleDeg(attack, feet);
      if (deg !== null && deg > cfg.attackFootAngleMax) violations.push({ id: 'attack-vs-feet', value: Math.round(deg), max: cfg.attackFootAngleMax });
    }
    if (sample.weaponPosition && sample.weaponHandPosition) {
      const d = distance(sample.weaponPosition, sample.weaponHandPosition);
      if (d !== null && d > cfg.weaponHandDistanceMax) violations.push({ id: 'weapon-not-in-hand', value: Number(d.toFixed(3)), max: cfg.weaponHandDistanceMax });
    }
    if (sample.twoHanded && sample.supportGripPosition && sample.supportHandPosition) {
      const d = distance(sample.supportGripPosition, sample.supportHandPosition);
      if (d !== null && d > cfg.supportHandDistanceMax) violations.push({ id: 'two-hand-support-detached', value: Number(d.toFixed(3)), max: cfg.supportHandDistanceMax });
    }
    if (sample.shieldPosition && sample.torsoPosition) {
      const d = distance(sample.shieldPosition, sample.torsoPosition);
      if (d !== null && d > cfg.shieldTorsoDistanceMax) violations.push({ id: 'shield-too-far', value: Number(d.toFixed(3)), max: cfg.shieldTorsoDistanceMax });
      const torsoToShield = {
        x: Number(sample.shieldPosition.x ?? sample.shieldPosition[0]) - Number(sample.torsoPosition.x ?? sample.torsoPosition[0]),
        y: Number(sample.shieldPosition.y ?? sample.shieldPosition[1]) - Number(sample.torsoPosition.y ?? sample.torsoPosition[1]),
        z: Number(sample.shieldPosition.z ?? sample.shieldPosition[2]) - Number(sample.torsoPosition.z ?? sample.torsoPosition[2])
      };
      const forward = vec(sample.threatDirection || sample.feetDirection);
      if (forward) {
        const front = dot(torsoToShield, forward);
        if (front !== null && front < cfg.shieldFrontDotMin) violations.push({ id: 'shield-not-front', value: Number(front.toFixed(3)), min: cfg.shieldFrontDotMin });
      }
    }
    if (sample.shieldUp) {
      const vertical = dot(sample.shieldUp, { x: 0, y: 1, z: 0 });
      if (vertical !== null && vertical < cfg.shieldVerticalDotMin) violations.push({ id: 'shield-not-vertical', value: Number(vertical.toFixed(3)), min: cfg.shieldVerticalDotMin });
    }
    if (finite(sample.shieldCoverage)) {
      const coverage = Math.max(0, Math.min(1, Number(sample.shieldCoverage)));
      if (coverage < cfg.shieldCoverageMin) violations.push({ id: 'shield-low-torso-coverage', value: Number(coverage.toFixed(3)), min: cfg.shieldCoverageMin });
    }
    const score = Math.max(0, 100 - violations.length * 18);
    return { score, violations };
  }

  function createRuntime(win) {
    if (!win || win.__WORLD_SERVER_ANIMATION_QUALITY__) return win?.WorldServerAnimationQuality || { evaluate };
    win.__WORLD_SERVER_ANIMATION_QUALITY__ = true;
    const rigs = new Set();
    const endpoint = '/api/quality-telemetry';
    const app = (win.location.pathname.match(/\/apps\/([^/]+)/) || [])[1] || 'unknown';

    function post(message) {
      const body = JSON.stringify({ type: 'animation_quality', app, path: win.location.pathname, ts: Date.now(), message: JSON.stringify(message) });
      try {
        if (win.navigator.sendBeacon) win.navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
        else win.fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
      } catch {}
    }

    function registerRig(adapter) {
      if (!adapter || typeof adapter.sample !== 'function') return () => {};
      rigs.add(adapter);
      return () => rigs.delete(adapter);
    }

    function tick() {
      let sampled = 0, totalScore = 0, violationCount = 0;
      for (const adapter of rigs) {
        try {
          const sample = adapter.sample();
          if (!sample) continue;
          const result = evaluate(sample, adapter.policy);
          sampled++;
          totalScore += result.score;
          violationCount += result.violations.length;
          if (result.violations.length && adapter.safeAutoRepair === true && typeof adapter.repair === 'function') {
            try { adapter.repair(result); } catch {}
          }
          adapter.onResult?.(result);
          win.dispatchEvent(new CustomEvent('worldserver:animation-quality', { detail: { result, rig: adapter.id || 'rig' } }));
        } catch {}
      }
      if (sampled) post({ n: sampled, s: Math.round(totalScore / sampled), v: violationCount });
    }

    const timer = win.setInterval(tick, 10000);
    win.addEventListener('pagehide', () => win.clearInterval(timer), { once: true });
    return Object.freeze({ evaluate, registerRig, sampleNow: tick });
  }

  return { evaluate, angleDeg, distance, dot, createRuntime };
});
