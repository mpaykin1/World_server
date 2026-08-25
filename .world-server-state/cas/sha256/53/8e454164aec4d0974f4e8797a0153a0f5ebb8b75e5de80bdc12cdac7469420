export class TextureMetricsCollector {
  constructor({estimatedTextureVramMB = null} = {}) {
    this.frames = [];
    this.last = null;
    this.estimatedTextureVramMB = estimatedTextureVramMB;
  }
  frame(timestampMs) {
    if (this.last != null) this.frames.push(timestampMs - this.last);
    this.last = timestampMs;
  }
  report(platform = 'web_desktop') {
    const values = this.frames.filter(v => Number.isFinite(v) && v > 0).sort((a,b)=>a-b);
    const mean = values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
    const p95 = values.length ? values[Math.min(values.length-1, Math.floor(values.length*0.95))] : null;
    return {
      platform,
      fps: mean ? 1000/mean : null,
      p95FrameMs: p95,
      textureVramMB: this.estimatedTextureVramMB,
      textureVramSource: this.estimatedTextureVramMB == null ? 'UNAVAILABLE' : 'STATIC_RUNTIME_PLAN_ESTIMATE',
      visualDelta: null,
      visualDeltaSource: 'REQUIRES_BEFORE_AFTER_CAPTURE',
      frames: values.length
    };
  }
}
