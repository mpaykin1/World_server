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

float ringMax(vec2 uv, vec2 px, float radius) {
  float m = 0.0;
  for (int i = 0; i < 24; i++) {
    float a = float(i) / 24.0 * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    m = max(m, maskAt(uv + d * px * radius));
  }
  return m;
}

void main() {
  vec3 base = texture2D(tColor, vUv).rgb;
  float center = maskAt(vUv);
  vec2 px = 1.0 / max(uResolution, vec2(1.0));

  float r2 = ringMax(vUv, px, 2.0);
  float r4 = ringMax(vUv, px, 4.0);
  float r8 = ringMax(vUv, px, 8.0);
  float r14 = ringMax(vUv, px, 14.0);
  float r24 = ringMax(vUv, px, 24.0);

  float hotCore = max(r2 - center, 0.0);
  float goldBand = max(r4 - max(center, r2 * 0.72), 0.0);
  goldBand += max(r8 - max(center, r4 * 0.82), 0.0) * 0.55;
  float amberHalo = max(r14 - center, 0.0) * 0.38;
  amberHalo += max(r24 - center, 0.0) * 0.16;

  float stableFilament =
    0.94 + 0.06 * sin(vUv.x * 487.0 + vUv.y * 263.0) *
    sin(vUv.y * 719.0 - vUv.x * 191.0);
  float breathe = 0.97 + 0.03 * sin(uTime * 1.7);

  vec3 hot = vec3(1.00, 0.985, 0.90);
  vec3 gold = vec3(1.00, 0.67, 0.19);
  vec3 amber = vec3(1.00, 0.27, 0.035);

  vec3 col = base;
  col += amber * amberHalo * 1.15 * uOutline;
  col += gold * goldBand * 1.72 * stableFilament * breathe * uOutline;
  col += hot * hotCore * 2.35 * stableFilament * uOutline;
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
