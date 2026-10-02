export const LIGHT_PROFILE_VERSION = 1;

export const livingGoldProfile = Object.freeze({
  id: 'living-gold',
  core: [1.0, 0.985, 0.90],
  gold: [1.0, 0.67, 0.19],
  amber: [1.0, 0.27, 0.035],
  coreGain: 2.8,
  goldGain: 1.75,
  haloGain: 1.15,
  bloomGain: 1.45,
  bloomRadius: 2.4,
  rimPower: 2.2,
  depthGain: 0.34,
  filamentGain: 0.24,
  filamentThreshold: 0.90,
  temporalBlend: 0.78,
  edgeSoftness: 0.72,
  topGain: 1.16,
  middleGain: 1.0,
  bottomGain: 0.92
});

export function mergeLightProfile(base = livingGoldProfile, overrides = {}) {
  return { ...base, ...overrides };
}

export function validateLightProfile(profile) {
  const required = [
    'coreGain', 'goldGain', 'haloGain', 'bloomGain', 'bloomRadius',
    'rimPower', 'depthGain', 'filamentGain', 'temporalBlend'
  ];
  for (const key of required) {
    if (!Number.isFinite(profile[key])) throw new TypeError('LIGHT profile invalid: ' + key);
  }
  for (const key of ['core', 'gold', 'amber']) {
    if (!Array.isArray(profile[key]) || profile[key].length !== 3) {
      throw new TypeError('LIGHT profile invalid color: ' + key);
    }
  }
  return true;
}
