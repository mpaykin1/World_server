import * as THREE from 'three';

function target(width, height, { hdr = false } = {}) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true
  });
}

function withOverride(scene, material, fn) {
  const previous = scene.overrideMaterial;
  scene.overrideMaterial = material;
  try { fn(); } finally { scene.overrideMaterial = previous; }
}

export class LightCapture {
  constructor(renderer, width, height) {
    this.renderer = renderer;
    this.color = target(width, height, { hdr: true });
    this.mask = target(width, height);
    this.normal = target(width, height);
    this.depth = target(width, height);
    this.normalMaterial = new THREE.MeshNormalMaterial();
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.BasicDepthPacking
    });
  }

  resize(width, height) {
    for (const rt of [this.color, this.mask, this.normal, this.depth]) {
      rt.setSize(width, height);
    }
  }

  render({ colorScene, maskScene, camera }) {
    const r = this.renderer;
    this.#renderScene(this.color, colorScene, camera, 0x000000);
    this.#renderScene(this.mask, maskScene, camera, 0x000000);

    withOverride(colorScene, this.normalMaterial, () => {
      this.#renderScene(this.normal, colorScene, camera, 0x000000);
    });
    withOverride(colorScene, this.depthMaterial, () => {
      this.#renderScene(this.depth, colorScene, camera, 0xffffff);
    });
  }

  #renderScene(targetRt, scene, camera, clearColor) {
    const r = this.renderer;
    r.setRenderTarget(targetRt);
    r.setClearColor(clearColor, 1);
    r.clear(true, true, true);
    r.render(scene, camera);
  }

  dispose() {
    for (const rt of [this.color, this.mask, this.normal, this.depth]) rt.dispose();
    this.normalMaterial.dispose();
    this.depthMaterial.dispose();
  }
}
