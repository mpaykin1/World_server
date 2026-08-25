export function probeTextureGpuCapabilities(gl) {
  if (!gl) throw new Error('WebGL context required');
  const exts = gl.getSupportedExtensions?.() || [];
  const has = (needle) => exts.some(x => x.toLowerCase().includes(needle));
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  return {
    platform: 'web',
    webgl2: isWebGL2,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    maxArrayLayers: isWebGL2 ? gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) : 0,
    anisotropy: has('anisotropic'),
    astc: has('astc'),
    etc2: isWebGL2 || has('etc'),
    bc: has('s3tc') || has('bptc'),
    ktx2: true,
    measuredFromRuntime: true,
    ts: Date.now()
  };
}
