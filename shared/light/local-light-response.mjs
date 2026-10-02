function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v) || 0));
}

function normalize(v) {
  const x = Number(v?.x) || 0, y = Number(v?.y) || 0, z = Number(v?.z) || 0;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export function localLightContribution(surface, light, enabled = true) {
  if (!enabled || light?.enabled === false) return 0;
  const dx = (Number(light?.position?.x) || 0) - (Number(surface?.position?.x) || 0);
  const dy = (Number(light?.position?.y) || 0) - (Number(surface?.position?.y) || 0);
  const dz = (Number(light?.position?.z) || 0) - (Number(surface?.position?.z) || 0);
  const distance = Math.hypot(dx, dy, dz);
  const radius = Math.max(0.0001, Number(light?.radius) || 0);
  if (distance >= radius) return 0;
  const L = normalize({ x: dx, y: dy, z: dz });
  const N = normalize(surface?.normal);
  const ndotl = Math.max(0, N.x * L.x + N.y * L.y + N.z * L.z);
  const falloff = (1 - distance / radius) ** 2;
  return clamp01(falloff * ndotl * Math.max(0, Number(light?.intensity) || 0));
}

export function applyLocalLightRgb(rgb, surface, lights = [], options = {}) {
  const ambient = clamp01(options.ambient ?? 0.18);
  const enabled = options.enabled !== false;
  const energy = lights.reduce((sum, light) => sum + localLightContribution(surface, light, enabled), 0);
  const gain = ambient + energy;
  return rgb.map(channel => Math.max(0, Math.min(255, Math.round((Number(channel) || 0) * gain))));
}
