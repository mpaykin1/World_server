export function applyUnifiedQualityV9(plan, ctx = {}) {
  const a = plan?.actions || {};
  const out = {applied: [], skipped: []};
  const set = (name, fn) => { try { fn(); out.applied.push(name); } catch (e) { out.skipped.push({name,error:String(e)}); } };
  if (ctx.textureStreamer && a.textures) set('textures', () => ctx.textureStreamer.setQualityAction?.(a.textures));
  if (ctx.lodManager && a.meshes) set('meshes', () => ctx.lodManager.setQualityAction?.(a.meshes));
  if (ctx.lighting && a.lighting) set('lighting', () => ctx.lighting.setQualityAction?.(a.lighting));
  if (ctx.shadowManager && a.shadows) set('shadows', () => ctx.shadowManager.setQualityAction?.(a.shadows));
  if (ctx.particles && a.particles) set('particles', () => ctx.particles.setQualityAction?.(a.particles));
  if (ctx.animation && a.animation) set('animation', () => ctx.animation.setQualityAction?.(a.animation));
  return out;
}
