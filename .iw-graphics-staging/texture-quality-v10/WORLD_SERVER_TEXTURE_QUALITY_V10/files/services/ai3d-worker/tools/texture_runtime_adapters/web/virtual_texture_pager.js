export class VirtualTexturePager {
  constructor(gl, {width, height, layers, internalFormat = null} = {}) {
    if (!gl || !width || !height || !layers) throw new Error('gl,width,height,layers required');
    this.gl = gl; this.width = width; this.height = height; this.layers = layers;
    this.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, internalFormat || gl.RGBA8, width, height, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.resident = new Map();
  }
  upload(layer, source, key = String(layer)) {
    if (layer < 0 || layer >= this.layers) throw new Error('layer out of range');
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, this.width, this.height, 1, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.resident.set(key, {layer, uploadedAt: performance.now()}); return layer;
  }
  evict(key) { const row=this.resident.get(key); if (!row) return false; this.resident.delete(key); return true; }
  stats() { return {residentPages:this.resident.size, capacity:this.layers, measuredFromRuntime:true}; }
}
