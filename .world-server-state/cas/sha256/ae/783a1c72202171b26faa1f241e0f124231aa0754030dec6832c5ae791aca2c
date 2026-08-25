export class TextureResidencyWatchdog {
  constructor({ onEvent = () => {}, maxEvents = 2048 } = {}) {
    this.onEvent = onEvent;
    this.maxEvents = maxEvents;
    this.events = [];
    this.deviceLost = false;
  }
  record(setKey, event, extra = {}) {
    const row = { setKey, event, timestamp: performance.now() / 1000, ...extra };
    this.events.push(row);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.onEvent(row);
    return row;
  }
  attachWebGPUDevice(device) {
    if (!device || !device.lost) return false;
    device.lost.then((info) => {
      this.deviceLost = true;
      this.record('__device__', 'device-lost', { reason: info?.reason || 'unknown', message: info?.message || '' });
    });
    return true;
  }
  attachWebGLCanvas(canvas) {
    if (!canvas?.addEventListener) return false;
    canvas.addEventListener('webglcontextlost', (event) => {
      this.record('__device__', 'context-lost', { statusMessage: event.statusMessage || '' });
    });
    canvas.addEventListener('webglcontextrestored', () => this.record('__device__', 'context-restored'));
    return true;
  }
  snapshot() { return { schemaVersion: 1, events: [...this.events], deviceLost: this.deviceLost }; }
}

export function applyTextureEmergencyPolicy(textures, plan) {
  const byKey = new Map((plan?.entries || []).map((x) => [`${x.profile || ''}:${x.setKey}`, x]));
  return textures.map((texture) => {
    const key = `${texture.profile || ''}:${texture.setKey}`;
    const action = byKey.get(key) || byKey.get(`:${texture.setKey}`);
    return { ...texture, requestedMipBiasDelta: action?.emergencyMipBiasDelta || 0 };
  });
}
