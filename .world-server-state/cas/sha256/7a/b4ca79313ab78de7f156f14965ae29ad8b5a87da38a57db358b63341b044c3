export class TextureRuntimeAdapter {
  constructor(plan, {telemetrySink = null} = {}) {
    this.plan = plan;
    this.telemetrySink = telemetrySink;
  }
  recommend({setKey, distance = 100, screenCoverage = 0, visible = true, seconds = 1}) {
    const score = (visible ? 1 : 0.15) * Math.max(0, seconds) * (0.25 + Math.max(0, Math.min(1, screenCoverage)) * 3) / Math.sqrt(Math.max(0.05, distance));
    const desiredMipBias = score > 0.9 ? 0 : score > 0.3 ? 1 : score > 0.08 ? 2 : 3;
    const event = {setKey, distance, screenCoverage, visible, seconds, desiredMipBias, ts: Date.now()};
    if (this.telemetrySink) this.telemetrySink(event);
    return event;
  }
  static uploadTextureArrayWebGL2(gl, images) {
    if (!gl || !images?.length) throw new Error('WebGL2 context and images are required');
    const {width, height} = images[0];
    if (!images.every(i => i.width === width && i.height === height)) throw new Error('Texture-array layers must have identical dimensions');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, images.length);
    images.forEach((img, layer) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, img));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }
}
