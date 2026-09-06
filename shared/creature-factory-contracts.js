(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CreatureFactoryContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const G = typeof globalThis !== 'undefined' ? globalThis : this;
  if (G.CreatureFactoryContracts) return G.CreatureFactoryContracts;

  const VALID_CATEGORIES = [
    'reptile', 'croc_teeth', 'fish', 'dragon', 'dragon_fire',
    'human', 'human_sword', 'human_torch', 'human_gun',
    'ship', 'steampunk_vehicle', 'creature', 'monster'
  ];

  const VALID_OBJECT_TYPES = [
    'group', 'box', 'sphere', 'cylinder', 'cone', 'capsule', 'torus', 'extrude', 'lathe', 'instanced'
  ];

  function validateParams(params, category) {
    if (!params || typeof params !== 'object') return { ok: false, error: 'params must be an object' };
    const errors = [];
    if (typeof params.scale !== 'number' || params.scale <= 0) errors.push('scale must be a positive number');
    if (params.lodBias !== undefined && (typeof params.lodBias !== 'number' || params.lodBias < 0 || params.lodBias > 1)) errors.push('lodBias must be 0..1');
    if (params.detailLevel !== undefined && !['low', 'mid', 'high', 'ultra'].includes(params.detailLevel)) errors.push('detailLevel must be low|mid|high|ultra');
    if (params.seed !== undefined && typeof params.seed !== 'number') errors.push('seed must be a number');
    if (params.symmetry !== undefined && typeof params.symmetry !== 'boolean') errors.push('symmetry must be boolean');
    if (params.animationBudget !== undefined && (typeof params.animationBudget !== 'number' || params.animationBudget < 0)) errors.push('animationBudget must be non-negative number');
    if (category && (category.startsWith('human') || category === 'creature' || category === 'monster')) {
      if (params.ikEnabled !== undefined && typeof params.ikEnabled !== 'boolean') errors.push('ikEnabled must be boolean for bipedal creatures');
      if (params.footLocking !== undefined && typeof params.footLocking !== 'boolean') errors.push('footLocking must be boolean for bipedal creatures');
    }
    if (category === 'ship' || category === 'steampunk_vehicle') {
      if (params.hullSegments !== undefined && (typeof params.hullSegments !== 'number' || params.hullSegments < 3)) errors.push('hullSegments must be >=3 for vehicles');
    }
    if (errors.length) return { ok: false, error: errors.join('; ') };
    return { ok: true };
  }

  function validateObject(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'object must be an object' };
    if (!obj.type || !VALID_OBJECT_TYPES.includes(obj.type)) return { ok: false, error: 'object.type must be one of: ' + VALID_OBJECT_TYPES.join(', ') };
    if (obj.children !== undefined) {
      if (!Array.isArray(obj.children)) return { ok: false, error: 'object.children must be an array' };
      for (let i = 0; i < obj.children.length; i++) {
        const r = validateObject(obj.children[i]);
        if (!r.ok) return { ok: false, error: 'object.children[' + i + ']: ' + r.error };
      }
    }
    return { ok: true };
  }

  function validateMaterialSettings(ms) {
    if (!ms || typeof ms !== 'object') return { ok: true };
    const errors = [];
    if (ms.albedo !== undefined) {
      if (!Array.isArray(ms.albedo) || ms.albedo.length !== 3 || !ms.albedo.every(v => typeof v === 'number' && v >= 0 && v <= 1))
        errors.push('materialSettings.albedo must be [r,g,b] 0..1');
    }
    if (ms.roughness !== undefined && (typeof ms.roughness !== 'number' || ms.roughness < 0 || ms.roughness > 1))
      errors.push('materialSettings.roughness must be 0..1');
    if (ms.metalness !== undefined && (typeof ms.metalness !== 'number' || ms.metalness < 0 || ms.metalness > 1))
      errors.push('materialSettings.metalness must be 0..1');
    if (ms.emissive !== undefined) {
      if (!Array.isArray(ms.emissive) || ms.emissive.length !== 3 || !ms.emissive.every(v => typeof v === 'number'))
        errors.push('materialSettings.emissive must be [r,g,b]');
    }
    if (ms.emissiveIntensity !== undefined && (typeof ms.emissiveIntensity !== 'number' || ms.emissiveIntensity < 0))
      errors.push('materialSettings.emissiveIntensity must be non-negative');
    if (ms.opacity !== undefined && (typeof ms.opacity !== 'number' || ms.opacity < 0 || ms.opacity > 1))
      errors.push('materialSettings.opacity must be 0..1');
    if (errors.length) return { ok: false, error: errors.join('; ') };
    return { ok: true };
  }

  function validateProceduralAssetV1(asset) {
    if (!asset || typeof asset !== 'object') return { ok: false, error: 'asset must be an object' };
    if (asset.format !== 'zero-signal-procedural-asset-v1') return { ok: false, error: 'format must be zero-signal-procedural-asset-v1' };
    if (!asset.category || !VALID_CATEGORIES.includes(asset.category)) return { ok: false, error: 'category must be one of: ' + VALID_CATEGORIES.join(', ') };
    if (typeof asset.name !== 'string' || asset.name.length === 0) return { ok: false, error: 'name must be a non-empty string' };
    const pr = validateParams(asset.params, asset.category);
    if (!pr.ok) return { ok: false, error: 'params: ' + pr.error };
    const or = validateObject(asset.object);
    if (!or.ok) return { ok: false, error: or.error };
    if (asset.materialSettings !== undefined) {
      const mr = validateMaterialSettings(asset.materialSettings);
      if (!mr.ok) return { ok: false, error: mr.error };
    }
    return { ok: true };
  }

  function validateGodotProceduralAssetV1(asset) {
    if (!asset || typeof asset !== 'object') return { ok: false, error: 'asset must be an object' };
    if (asset.format !== 'zero-signal-godot-procedural-asset-v1') return { ok: false, error: 'format must be zero-signal-godot-procedural-asset-v1' };
    if (!asset.category || !VALID_CATEGORIES.includes(asset.category)) return { ok: false, error: 'category must be one of: ' + VALID_CATEGORIES.join(', ') };
    if (typeof asset.name !== 'string' || asset.name.length === 0) return { ok: false, error: 'name must be a non-empty string' };
    const pr = validateParams(asset.params, asset.category);
    if (!pr.ok) return { ok: false, error: 'params: ' + pr.error };
    if (!asset.controls || typeof asset.controls !== 'object') return { ok: false, error: 'controls must be an object' };
    const c = asset.controls;
    if (c.type !== undefined && !['orbit', 'first_person', 'third_person', 'top_down', 'side_scroll'].includes(c.type))
      return { ok: false, error: 'controls.type must be orbit|first_person|third_person|top_down|side_scroll' };
    if (c.moveAxis !== undefined && !['xz', 'xy', 'none'].includes(c.moveAxis))
      return { ok: false, error: 'controls.moveAxis must be xz|xy|none' };
    if (c.lookMode !== undefined && !['yaw_pitch', 'yaw', 'none'].includes(c.lookMode))
      return { ok: false, error: 'controls.lookMode must be yaw_pitch|yaw|none' };
    return { ok: true };
  }

  G.CreatureFactoryContracts = {
    version: '1.0.0',
    VALID_CATEGORIES,
    VALID_OBJECT_TYPES,
    validateParams,
    validateObject,
    validateMaterialSettings,
    validateProceduralAssetV1,
    validateGodotProceduralAssetV1
  };
  return G.CreatureFactoryContracts;
});
