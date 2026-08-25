export function normalVarianceRoughness(baseRoughness, normalLength) {
  const variance = Math.max(0, 1 - Math.min(1, normalLength));
  return Math.min(1, Math.sqrt(baseRoughness * baseRoughness + variance));
}
export function applyTextureQualityGovernor(state, plan) {
  const a = plan?.actions || {};
  if (state.textureStreamer && a.textures) state.textureStreamer.qualityAction = a.textures;
  if (state.particles && a.particles) state.particles.qualityAction = a.particles;
  return a;
}
