'use strict';

// Software virtual-texture physical page cache for WebGPU.
// This deliberately does NOT claim hardware sparse residency.
export class WebGPUVirtualTextureCache {
  constructor(device, { pageWidth, pageHeight, layers = 128, format = 'rgba8unorm' }) {
    this.device = device;
    this.pageWidth = pageWidth;
    this.pageHeight = pageHeight;
    this.layers = layers;
    this.format = format;
    this.texture = device.createTexture({
      size: { width: pageWidth, height: pageHeight, depthOrArrayLayers: layers },
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.pageTable = new Map();
    this.nextLayer = 0;
  }

  async uploadExternalImage(pageId, source) {
    if (this.nextLayer >= this.layers && !this.pageTable.has(pageId)) {
      throw new Error('WebGPU VT physical cache full');
    }
    const layer = this.pageTable.has(pageId) ? this.pageTable.get(pageId) : this.nextLayer++;
    this.device.queue.copyExternalImageToTexture(
      { source },
      { texture: this.texture, origin: { x: 0, y: 0, z: layer } },
      { width: this.pageWidth, height: this.pageHeight }
    );
    this.pageTable.set(pageId, layer);
    return layer;
  }

  evict(pageId) { return this.pageTable.delete(pageId); }
  layerFor(pageId) { return this.pageTable.get(pageId); }
}
