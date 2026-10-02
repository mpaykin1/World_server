import * as THREE from 'three';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tMask;
uniform vec2 uResolution;
uniform float uTime;
uniform float uOutline;

float maskAt(vec2 uv) {
  return texture2D(tMask, clamp(uv, 0.0, 1.0)).r;
}

void main() {
  vec3 base = texture2D(tColor, vUv).rgb;
  float center = maskAt(vUv);
  vec2 px = 1.0 / uResolution;
  float nearEdge = 0.0;
  float farGlow = 0.0;

  for (int i = 0; i < 24; i++) {
    float a = float(i) / 24.0 * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    nearEdge = max(nearEdge, maskAt(vUv + d * px * 4.0));
    nearEdge = max(nearEdge, maskAt(vUv + d * px * 7.0));
    farGlow = max(farGlow, maskAt(vUv + d * px * 14.0));
    farGlow = max(farGlow, maskAt(vUv + d * px * 24.0));
  }

  float outline = max(nearEdge - center, 0.0);
  float glow = max(farGlow - center, 0.0) * (0.55 + 0.10 * sin(uTime * 3.0));
  vec3 col = base;
  col += vec3(1.0) * outline * 1.65 * uOutline;
  col += vec3(1.0) * glow * 0.42 * uOutline;
  gl_FragColor = vec4(col, 1.0);
}`;

function makeTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });
}

export class Silhouette3DOutlinePipeline {
  constructor({ renderer, colorScene, maskScene, camera, width, height, outline = 1 }) {
    this.renderer = renderer;
    this.colorScene = colorScene;
    this.maskScene = maskScene;
    this.camera = camera;
    this.colorTarget = makeTarget(width, height);
    this.maskTarget = makeTarget(width, height);
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tColor: { value: this.colorTarget.texture },
      tMask: { value: this.maskTarget.texture },
      uResolution: { value: new THREE.Vector2(width, height) },
      uTime: { value: 0 },
      uOutline: { value: outline }
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  resize(width, height) {
    this.colorTarget.setSize(width, height);
    this.maskTarget.setSize(width, height);
    this.uniforms.uResolution.value.set(width, height);
  }

  render(timeSeconds = 0) {
    const r = this.renderer;
    this.uniforms.uTime.value = timeSeconds;

    r.setRenderTarget(this.colorTarget);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.colorScene, this.camera);

    r.setRenderTarget(this.maskTarget);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(this.maskScene, this.camera);

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }

  dispose() {
    this.colorTarget.dispose();
    this.maskTarget.dispose();
    this.material.dispose();
  }
}
