'use strict';

(function () {
  if (window.__WORLD_SERVER_PREDICTIVE_STREAMING__) return;
  window.__WORLD_SERVER_PREDICTIVE_STREAMING__ = true;

  const registrations = new Set();
  let qualityScale = 1;
  const profileScale = { performance: 0.72, balanced: 0.86, high: 1, ultra: 1.16 };

  addEventListener('worldserver:graphics-quality', event => {
    qualityScale = profileScale[event.detail?.profile] || 1;
  });

  function vec(v) {
    return { x: Number(v?.x || 0), y: Number(v?.y || 0), z: Number(v?.z || 0) };
  }
  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function registerThree({ camera, getPosition, getDirection, onPrediction, leadMs = 850, lookAhead = 14, minDelta = 3, intervalMs = 180 } = {}) {
    if (!camera && typeof getPosition !== 'function') return () => {};
    let active = true;
    let lastAt = performance.now();
    let lastPos = vec(typeof getPosition === 'function' ? getPosition() : camera.position);
    let velocity = { x: 0, y: 0, z: 0 };
    let lastPrediction = null;

    function direction() {
      if (typeof getDirection === 'function') return vec(getDirection());
      const q = camera?.quaternion;
      if (q && [q.x,q.y,q.z,q.w].every(Number.isFinite)) {
        const x = Number(q.x), y = Number(q.y), z = Number(q.z), w = Number(q.w);
        return {
          x: -2 * (x * z + w * y),
          y: -2 * (y * z - w * x),
          z: -(1 - 2 * (x * x + y * y))
        };
      }
      return { x: 0, y: 0, z: -1 };
    }

    function step(now) {
      if (!active) return;
      if (document.visibilityState !== 'visible' || now - lastAt < intervalMs) {
        requestAnimationFrame(step);
        return;
      }
      const pos = vec(typeof getPosition === 'function' ? getPosition() : camera.position);
      const dt = Math.max(0.016, (now - lastAt) / 1000);
      const instant = { x: (pos.x - lastPos.x) / dt, y: (pos.y - lastPos.y) / dt, z: (pos.z - lastPos.z) / dt };
      velocity = {
        x: velocity.x * 0.68 + instant.x * 0.32,
        y: velocity.y * 0.68 + instant.y * 0.32,
        z: velocity.z * 0.68 + instant.z * 0.32
      };
      const dir = direction();
      const lead = Math.max(0.2, Math.min(1.8, leadMs / 1000));
      const predicted = {
        x: pos.x + velocity.x * lead + dir.x * lookAhead,
        y: pos.y + velocity.y * lead + dir.y * lookAhead * 0.25,
        z: pos.z + velocity.z * lead + dir.z * lookAhead,
        radiusScale: qualityScale,
        speed: Math.round(Math.hypot(velocity.x, velocity.y, velocity.z) * 10) / 10
      };
      if (!lastPrediction || dist(predicted, lastPrediction) >= minDelta) {
        lastPrediction = predicted;
        try { onPrediction?.(predicted); } catch {}
        dispatchEvent(new CustomEvent('worldserver:stream-prediction', { detail: predicted }));
      }
      lastPos = pos;
      lastAt = now;
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    const registration = { stop: () => { active = false; } };
    registrations.add(registration);
    return () => { active = false; registrations.delete(registration); };
  }

  window.WorldServerPredictiveStreaming = Object.freeze({ registerThree });
})();
