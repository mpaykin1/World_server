'use strict';

(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && !root.__WORLD_SERVER_RIG_ADAPTERS__) {
    root.__WORLD_SERVER_RIG_ADAPTERS__ = true;
    root.WorldServerRigAdapters = api;
  }
})(typeof window !== 'undefined' ? window : null, function (win) {
  const aliases = Object.freeze({
    leftFoot: [/left.*foot/i,/foot.*l$/i,/l[_ .-]*foot/i,/left.*ankle/i],
    rightFoot: [/right.*foot/i,/foot.*r$/i,/r[_ .-]*foot/i,/right.*ankle/i],
    leftHand: [/left.*hand/i,/hand.*l$/i,/l[_ .-]*hand/i],
    rightHand: [/right.*hand/i,/hand.*r$/i,/r[_ .-]*hand/i],
    chest: [/chest/i,/spine.?2/i,/upper.*torso/i,/torso/i],
    shield: [/shield/i],
    pistol: [/pistol|handgun/i],
    rifle: [/rifle|machine.?gun|automatic|gun/i],
    sword: [/sword|blade|weapon/i]
  });

  function allObjects(root) {
    const out = [];
    try { root?.traverse?.(o => out.push(o)); } catch {}
    return out;
  }
  function match(objects, patterns) {
    return objects.find(o => patterns.some(re => re.test(String(o?.name || '')))) || null;
  }
  function discoverThree(root) {
    const objects = allObjects(root);
    const map = {};
    for (const [key, patterns] of Object.entries(aliases)) map[key] = match(objects, patterns);
    const coverageKeys = ['leftFoot','rightFoot','leftHand','rightHand','chest'];
    const coverage = coverageKeys.filter(k => map[k]).length / coverageKeys.length;
    return { map, coverage: Number(coverage.toFixed(2)), objectCount: objects.length };
  }

  function structuralSummary(found, id) {
    return {
      id,
      discoveredCoverage: found.coverage,
      hasShield: Boolean(found.map.shield),
      hasPistol: Boolean(found.map.pistol),
      hasRifle: Boolean(found.map.rifle),
      hasSword: Boolean(found.map.sword)
    };
  }

  function registerThreeCharacter(root, options = {}) {
    const found = discoverThree(root);
    const id = options.id || root?.name || 'character';
    const semantic = structuralSummary(found, id);
    try { win?.dispatchEvent?.(new CustomEvent('worldserver:rig-discovered', { detail: semantic })); } catch {}

    if (win?.WorldServerAnimationQuality?.registerRig && typeof options.stateProvider === 'function') {
      try {
        const adapter = {
          id,
          policy: options.policy,
          safeAutoRepair: options.safeAutoRepair === true,
          repair: typeof options.repair === 'function' ? options.repair : undefined,
          onResult: typeof options.onResult === 'function' ? options.onResult : undefined,
          sample: () => ({
            ...options.stateProvider(),
            semanticMap: found.map,
            discoveredCoverage: found.coverage
          })
        };
        return win.WorldServerAnimationQuality.registerRig(adapter);
      } catch {}
    }
    return () => {};
  }

  function scanScene(root, options = {}) {
    const found = discoverThree(root);
    const relevant = Boolean(found.map.leftFoot || found.map.rightFoot || found.map.leftHand || found.map.rightHand || found.map.shield || found.map.pistol || found.map.rifle || found.map.sword);
    const detail = { ...structuralSummary(found, options.id || root?.name || 'scene'), relevant, objectCount: found.objectCount };
    try { win?.dispatchEvent?.(new CustomEvent('worldserver:rig-scan', { detail })); } catch {}
    return { ...found, relevant };
  }

  return Object.freeze({ aliases, discoverThree, structuralSummary, registerThreeCharacter, scanScene });
});
