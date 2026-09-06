(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreatureFactory = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : this;
  if (G.CreatureFactory) return G.CreatureFactory;

  const CATEGORIES = {
    reptile: { kind: 'quadruped', baseColor: [.16, .45, .18], roughness: .55, legs: 4, hasTail: true, hasHead: true, hasEyes: true, scaleFactor: 1.0 },
    croc_teeth: { kind: 'quadruped', baseColor: [.25, .45, .17], roughness: .6, legs: 4, hasTail: true, hasHead: true, hasEyes: true, teethShown: true, scaleFactor: 1.15 },
    fish: { kind: 'aquatic', baseColor: [.2, .55, .65], roughness: .45, hasDorsal: true, hasTail: true, noLegs: true, scaleFactor: .9 },
    dragon: { kind: 'quadruped', baseColor: [.28, .18, .12], roughness: .4, legs: 4, hasTail: true, hasHead: true, hasEyes: true, hasWings: true, scaleFactor: 1.2 },
    dragon_fire: { kind: 'quadruped', baseColor: [.4, .15, .08], roughness: .4, legs: 4, hasTail: true, hasHead: true, hasEyes: true, hasWings: true, emissive: [.8, .3, .05], emissiveIntensity: .8, scaleFactor: 1.25 },
    human: { kind: 'biped', baseColor: [.72, .55, .42], roughness: .5, legs: 2, arms: 2, hasTail: false, hasHead: true, hasEyes: true, scaleFactor: 1.35 },
    human_sword: { kind: 'biped', baseColor: [.68, .52, .4], roughness: .5, legs: 2, arms: 2, hasTail: false, hasHead: true, hasEyes: true, weapon: 'sword', scaleFactor: 1.35 },
    human_torch: { kind: 'biped', baseColor: [.66, .5, .38], roughness: .5, legs: 2, arms: 2, hasTail: false, hasHead: true, hasEyes: true, weapon: 'torch', emissive: [.9, .5, .05], emissiveIntensity: .9, scaleFactor: 1.35 },
    human_gun: { kind: 'biped', baseColor: [.62, .56, .5], roughness: .48, legs: 2, arms: 2, hasTail: false, hasHead: true, hasEyes: true, weapon: 'gun', scaleFactor: 1.35 },
    ship: { kind: 'vehicle', baseColor: [.45, .32, .2], roughness: .55, hullSegments: 8, hasMast: true, scaleFactor: 1.5 },
    steampunk_vehicle: { kind: 'vehicle', baseColor: [.55, .42, .2], roughness: .5, metal: true, hullSegments: 8, hasWheels: true, hasChimney: true, scaleFactor: 1.4 },
    creature: { kind: 'biped', baseColor: [.26, .4, .5], roughness: .5, legs: 2, arms: 2, hasTail: true, hasHead: true, hasEyes: true, hasWings: false, scaleFactor: 1.2 },
    monster: { kind: 'biped', baseColor: [.3, .25, .35], roughness: .55, legs: 2, arms: 2, hasTail: true, hasHead: true, hasEyes: true, emissive: [.4, .1, .5], emissiveIntensity: .4, scaleFactor: 1.5 }
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function defaultParams(category, custom) {
    const base = CATEGORIES[category] || CATEGORIES.creature;
    const out = {
      scale: 1,
      detailLevel: 'mid',
      lodBias: 1,
      seed: 12345,
      symmetry: base.kind !== 'fish',
      animationBudget: 1,
      baseColor: base.baseColor,
      roughness: base.roughness,
      metalness: base.metal ? 0.7 : 0,
      emissive: base.emissive || [0, 0, 0],
      emissiveIntensity: base.emissive ? base.emissiveIntensity : 0,
      legs: base.legs || 0,
      arms: base.arms || 0,
      hasTail: !!base.hasTail,
      hasHead: !!base.hasHead,
      hasEyes: !!base.hasEyes,
      hasWings: !!base.hasWings,
      hasDorsal: !!base.hasDorsal,
      teethShown: !!base.teethShown,
      hasMast: !!base.hasMast,
      hasWheels: !!base.hasWheels,
      hasChimney: !!base.hasChimney,
      noLegs: !!base.noLegs,
      weapon: base.weapon || null,
      kind: base.kind
    };
    if (custom && typeof custom === 'object') {
      for (const k of Object.keys(custom)) {
        if (custom[k] !== undefined) out[k] = custom[k];
      }
    }
    return out;
  }

  function resolveMaterial(category, params, materialSettings) {
    const ms = materialSettings || {};
    return {
      albedo: ms.albedo || params.baseColor || CATEGORIES[category].baseColor,
      roughness: ms.roughness !== undefined ? ms.roughness : (params.roughness !== undefined ? params.roughness : 0.5),
      metalness: ms.metalness !== undefined ? ms.metalness : (params.metalness || 0),
      emissive: ms.emissive !== undefined ? ms.emissive : (params.emissive || [0, 0, 0]),
      emissiveIntensity: ms.emissiveIntensity !== undefined ? ms.emissiveIntensity : (params.emissiveIntensity || 0),
      opacity: ms.opacity !== undefined ? ms.opacity : 1
    };
  }

  function materialKindFrom(category, params, matSettings) {
    if (matSettings && matSettings.kind) return matSettings.kind;
    if (params.metalness > 0.5) return 'metal';
    if (params.roughness > 0.65) return 'concrete';
    return 'skin';
  }

  function samplePBR(kind, u, v, t) {
    const mat = G.WorldProceduralMaterials;
    if (mat && mat.sample) return mat.sample(kind, u, v, t);
    return { albedo: [.5, .5, .5], roughness: .5, metalness: 0, height: 0 };
  }

  function telemetry(label, data) {
    if (G.CreatureFactoryTelemetry && G.CreatureFactoryTelemetry.record)
      G.CreatureFactoryTelemetry.record(label, data);
  }

  function resolveSegments(detailLevel) {
    switch (detailLevel) {
      case 'low': return 1;
      case 'mid': return 1.6;
      case 'high': return 2.2;
      case 'ultra': return 3;
      default: return 1.6;
    }
  }

  function buildParts(category, params) {
    const p = defaultParams(category, params);
    const d = resolveSegments(p.detailLevel);
    const scale = p.scale;
    const randomTail = 0.9 + (p.seed % 7) * 0.03;
    const parts = [];
    switch (p.kind) {
      case 'quadruped':
        parts.push({ name: 'body', kind: 'box', w: 1.3 * scale, h: .7 * scale, d: 2.0 * scale, pos: { x: 0, y: 1.1 * scale, z: 0 } });
        parts.push({ name: 'chest', kind: 'sphere', r: .6 * scale, pos: { x: 0, y: 1.3 * scale, z: .55 * scale } });
        parts.push({ name: 'head', kind: 'sphere', r: .42 * scale, pos: { x: 0, y: 1.5 * scale, z: 1.35 * scale } });
        parts.push({ name: 'neck', kind: 'cylinder', rTop: .16 * scale, rBot: .22 * scale, h: .4 * scale, pos: { x: 0, y: 1.45 * scale, z: 1.0 * scale } });
        if (p.hasTail) parts.push({ name: 'tail', kind: 'cylinder', rTop: .2 * scale, rBot: .06 * scale, h: 1.6 * scale * randomTail, pos: { x: 0, y: .9 * scale, z: -1.5 * scale }, rot: { x: Math.PI / 2.4, y: 0, z: 0 } });
        const legCount = p.legs || 4;
        for (let i = 0; i < legCount; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          const front = i < legCount / 2;
          parts.push({ name: 'leg' + i, kind: 'box', w: .2 * scale, h: .9 * scale, d: .22 * scale, pos: { x: side * .5 * scale, y: .45 * scale, z: front ? .75 * scale : -.75 * scale }, color: p.teethShown && !front ? [.9, .85, .8] : null });
        }
        if (p.hasWings) {
          parts.push({ name: 'wingL', kind: 'box', w: .04 * scale, h: .1 * scale, d: 1.6 * scale, pos: { x: -.65 * scale, y: 1.6 * scale, z: .3 * scale } });
          parts.push({ name: 'wingR', kind: 'box', w: .04 * scale, h: .1 * scale, d: 1.6 * scale, pos: { x: .65 * scale, y: 1.6 * scale, z: .3 * scale } });
        }
        break;
      case 'biped':
        parts.push({ name: 'pelvis', kind: 'box', w: .8 * scale, h: .5 * scale, d: .55 * scale, pos: { x: 0, y: 1.6 * scale, z: 0 } });
        parts.push({ name: 'chest', kind: 'box', w: .9 * scale, h: 1.0 * scale, d: .6 * scale, pos: { x: 0, y: 2.4 * scale, z: 0 } });
        parts.push({ name: 'head', kind: 'sphere', r: .34 * scale, pos: { x: 0, y: 3.3 * scale, z: .05 * scale } });
        const armCount = p.arms || 2;
        for (let i = 0; i < armCount; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          parts.push({ name: 'arm' + i, kind: 'box', w: .22 * scale, h: .95 * scale, d: .24 * scale, pos: { x: side * .6 * scale, y: 2.15 * scale, z: 0 } });
        }
        for (let i = 0; i < 2; i++) {
          const side = i % 2 === 0 ? 1 : -1;
          parts.push({ name: 'leg' + i, kind: 'box', w: .24 * scale, h: .9 * scale, d: .3 * scale, pos: { x: side * .2 * scale, y: .45 * scale, z: 0 } });
        }
        if (p.hasTail) parts.push({ name: 'tail', kind: 'cylinder', rTop: .18 * scale, rBot: .06 * scale, h: .9 * scale, pos: { x: 0, y: 1.8 * scale, z: -.6 * scale }, rot: { x: Math.PI / 4, y: 0, z: 0 } });
        if (p.weapon === 'sword') { parts.push({ name: 'weapon-hand', kind: 'box', w: .18 * scale, h: .18 * scale, d: .2 * scale, pos: { x: .7 * scale, y: 1.75 * scale, z: .1 * scale } }); parts.push({ name: 'blade', kind: 'box', w: .05 * scale, h: 1.0 * scale, d: .1 * scale, pos: { x: .7 * scale, y: 2.3 * scale, z: .1 * scale }, color: [.85, .85, .9] }); }
        if (p.weapon === 'torch') { parts.push({ name: 'torch-hand', kind: 'box', w: .18 * scale, h: .18 * scale, d: .18 * scale, pos: { x: .7 * scale, y: 1.7 * scale, z: .1 * scale } }); parts.push({ name: 'torch-shaft', kind: 'cylinder', rTop: .04 * scale, rBot: .04 * scale, h: .5 * scale, pos: { x: .7 * scale, y: 1.45 * scale, z: .1 * scale } }); parts.push({ name: 'flame', kind: 'sphere', r: .1 * scale, pos: { x: .7 * scale, y: 2.0 * scale, z: .1 * scale }, emissive: [.9, .4, .05] }); }
        if (p.weapon === 'gun') { parts.push({ name: 'gun-body', kind: 'box', w: .14 * scale, h: .12 * scale, d: .6 * scale, pos: { x: .7 * scale, y: 2.1 * scale, z: .15 * scale } }); parts.push({ name: 'gun-barrel', kind: 'cylinder', rTop: .03 * scale, rBot: .03 * scale, h: .5 * scale, pos: { x: .7 * scale, y: 2.15 * scale, z: .55 * scale }, rot: { x: Math.PI / 2, y: 0, z: 0 } }); }
        if (p.hasWings) { parts.push({ name: 'wingL', kind: 'box', w: .04 * scale, h: .08 * scale, d: 1.4 * scale, pos: { x: -.7 * scale, y: 2.4 * scale, z: 0 } }); parts.push({ name: 'wingR', kind: 'box', w: .04 * scale, h: .08 * scale, d: 1.4 * scale, pos: { x: .7 * scale, y: 2.4 * scale, z: 0 } }); }
        break;
      case 'aquatic':
        parts.push({ name: 'body', kind: 'capsule', r: .5 * scale, h: 2.2 * scale, pos: { x: 0, y: .5 * scale, z: 0 }, rot: { x: Math.PI / 2, y: 0, z: 0 } });
        parts.push({ name: 'head', kind: 'sphere', r: .34 * scale, pos: { x: .6 * scale, y: .4 * scale, z: 0 } });
        if (p.hasTail) parts.push({ name: 'tail', kind: 'cone', r: .28 * scale, h: .9 * scale, pos: { x: -1.6 * scale, y: .5 * scale, z: 0 }, rot: { x: 0, y: 0, z: Math.PI / 2 } });
        if (p.hasDorsal) parts.push({ name: 'dorsal', kind: 'cone', r: .16 * scale, h: .7 * scale, pos: { x: 0, y: 1.0 * scale, z: 0 }, rot: { x: 0, y: 0, z: 0 } });
        parts.push({ name: 'finL', kind: 'box', w: .04 * scale, h: .4 * scale, d: .4 * scale, pos: { x: .2 * scale, y: .2 * scale, z: .5 * scale }, rot: { x: 0, y: 0, z: Math.PI / 3 } });
        parts.push({ name: 'finR', kind: 'box', w: .04 * scale, h: .4 * scale, d: .4 * scale, pos: { x: .2 * scale, y: .2 * scale, z: -.5 * scale }, rot: { x: 0, y: 0, z: -Math.PI / 3 } });
        if (p.hasEyes) { parts.push({ name: 'eyeL', kind: 'sphere', r: .06 * scale, pos: { x: .85 * scale, y: .5 * scale, z: .16 * scale }, color: [.05, .05, .05] }); parts.push({ name: 'eyeR', kind: 'sphere', r: .06 * scale, pos: { x: .85 * scale, y: .5 * scale, z: -.16 * scale }, color: [.05, .05, .05] }); }
        break;
      case 'vehicle':
        parts.push({ name: 'hull', kind: 'box', w: 1.6 * scale, h: .7 * scale, d: 3.0 * scale, pos: { x: 0, y: .35 * scale, z: 0 } });
        parts.push({ name: 'bow', kind: 'cone', r: .6 * scale, h: 1.0 * scale, pos: { x: 0, y: .5 * scale, z: 1.8 * scale }, rot: { x: Math.PI / 2, y: 0, z: 0 } });
        parts.push({ name: 'deck', kind: 'box', w: 1.4 * scale, h: .2 * scale, d: 2.6 * scale, pos: { x: 0, y: .85 * scale, z: 0 } });
        if (p.hasMast) parts.push({ name: 'mast', kind: 'cylinder', rTop: .07 * scale, rBot: .1 * scale, h: 2.2 * scale, pos: { x: 0, y: 1.8 * scale, z: -.4 * scale } });
        if (p.hasChimney) parts.push({ name: 'chimney', kind: 'cylinder', rTop: .15 * scale, rBot: .18 * scale, h: .8 * scale, pos: { x: .4 * scale, y: 1.3 * scale, z: .2 * scale }, metal: true });
        if (p.hasWheels) {
          for (let i = 0; i < 4; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const front = i < 2;
            parts.push({ name: 'wheel' + i, kind: 'cylinder', rTop: .4 * scale, rBot: .4 * scale, h: .18 * scale, pos: { x: side * .9 * scale, y: .4 * scale, z: front ? .9 * scale : -.9 * scale }, rot: { x: 0, y: 0, z: Math.PI / 2 }, metal: true });
          }
        }
        break;
      default:
        parts.push({ name: 'body', kind: 'box', w: 1.0 * scale, h: 1.0 * scale, d: 1.0 * scale, pos: { x: 0, y: 1 * scale, z: 0 } });
        parts.push({ name: 'head', kind: 'sphere', r: .4 * scale, pos: { x: 0, y: 1.7 * scale, z: 0 } });
    }
    if (p.hasEyes && p.kind !== 'aquatic') {
      parts.push({ name: 'eyeL', kind: 'sphere', r: .06 * scale, pos: { x: p.kind === 'quadruped' ? .1 * scale : .14 * scale, y: p.kind === 'quadruped' ? 1.55 * scale : 3.35 * scale, z: p.kind === 'quadruped' ? 1.42 * scale : .12 * scale }, color: [.05, .05, .05] });
      parts.push({ name: 'eyeR', kind: 'sphere', r: .06 * scale, pos: { x: p.kind === 'quadruped' ? -.1 * scale : -.14 * scale, y: p.kind === 'quadruped' ? 1.55 * scale : 3.35 * scale, z: p.kind === 'quadruped' ? 1.42 * scale : .12 * scale }, color: [.05, .05, .05] });
    }
    return { parts, params: p, detail: d };
  }

  function buildHierarchy(category, params) {
    const { parts, params: p, detail } = buildParts(category, params);
    const root = { name: category, type: 'group', children: [] };
    for (const part of parts) {
      root.children.push({ name: part.name, type: part.kind, geometry: part });
    }
    return { root, parts, params: p, detail };
  }

  function contracts() {
    if (G.CreatureFactoryContracts) return G.CreatureFactoryContracts;
    const r = (typeof require === 'function') ? require('./creature-factory-contracts.js').CreatureFactoryContracts : null;
    if (r) return r;
    throw new Error('CreatureFactoryContracts must be loaded before CreatureFactory');
  }

  function generateAsset(category, params, materialSettings) {
    const v = contracts();
    if (!v.VALID_CATEGORIES.includes(category)) throw new Error('Unknown category: ' + category);
    const merged = defaultParams(category, params);
    const pr = v.validateParams(merged, category);
    if (!pr.ok) throw new Error(pr.error);
    const asset = {
      format: 'zero-signal-procedural-asset-v1',
      category,
      name: merged.name || (category + '-' + (merged.seed !== undefined ? merged.seed : 12345)),
      params: { ...merged },
      object: buildHierarchy(category, merged).root
    };
    if (materialSettings) asset.materialSettings = materialSettings;
    const vr = v.validateProceduralAssetV1(asset);
    if (!vr.ok) throw new Error(vr.error);
    const res = resolveMaterial(category, merged, materialSettings);
    telemetry('generated', { category, name: asset.name, parts: asset.object.children.length });
    return { asset, resolvedMaterial: res, materialKind: materialKindFrom(category, merged, materialSettings) };
  }

  function generateGodotAsset(category, params, controls) {
    const v = contracts();
    if (!v.VALID_CATEGORIES.includes(category)) throw new Error('Unknown category: ' + category);
    const merged = defaultParams(category, params);
    const pr = v.validateParams(merged, category);
    if (!pr.ok) throw new Error(pr.error);
    const asset = {
      format: 'zero-signal-godot-procedural-asset-v1',
      category,
      name: merged.name || (category + '-' + (merged.seed !== undefined ? merged.seed : 12345)),
      params: { ...merged },
      controls: controls || { type: 'third_person', moveAxis: 'xz', lookMode: 'yaw_pitch' }
    };
    const vr = v.validateGodotProceduralAssetV1(asset);
    if (!vr.ok) throw new Error(vr.error);
    return { asset };
  }

  G.CreatureFactory = {
    version: '1.0.0',
    CATEGORIES,
    defaultParams,
    resolveMaterial,
    materialKindFrom,
    samplePBR,
    buildParts,
    buildHierarchy,
    generateAsset,
    generateGodotAsset
  };
  return G.CreatureFactory;
});
