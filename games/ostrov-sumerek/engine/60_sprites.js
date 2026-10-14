/* =============================================================================
   24 · Sprite batch (weapons, projectiles, loot) and ribbons (trails, beams, bolts)
============================================================================= */
const SPRITE_VERT = /* glsl */`
attribute vec3 aPos; attribute vec2 aSize; attribute float aRot; attribute vec4 aUV; attribute vec4 aCol; attribute vec4 aPiv;
uniform vec3 uRight, uUp;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_vertex>
void main() {
  vec2 l = (position.xy - aPiv.xy) * aSize;
  float cs = cos(aRot), sn = sin(aRot);
  vec2 r = vec2(l.x * cs - l.y * sn, l.x * sn + l.y * cs);
  vec3 wp = aPos + uRight * r.x + uUp * r.y;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vec2 t = uv;
  if (aPiv.z < 0.0) t.x = 1.0 - t.x;
  if (aPiv.w < 0.0) t.y = 1.0 - t.y;
  vUv = aUV.xy + t * aUV.zw;
  vCol = aCol;
  #include <fog_vertex>
}`;
const SPRITE_FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv; varying vec4 vCol;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  float l = dot(t.rgb, vec3(0.3, 0.55, 0.15));
  gl_FragColor = vec4(t.rgb * vCol.rgb + t.rgb * vCol.a * (0.4 + l * l * 3.0), 1.0);
  #include <fog_fragment>
}`;
class SpriteBatch {
  constructor(max, tex, order) {
    this.max = max; this.n = 0;
    const sizes = { aPos: 3, aSize: 2, aRot: 1, aUV: 4, aCol: 4, aPiv: 4 };
    this.a = {}; const spec = {};
    for (const k in sizes) { this.a[k] = new Float32Array(max * sizes[k]); spec[k] = [this.a[k], sizes[k]]; }
    const inst = makeInstGeo(quadBase, 0, spec);
    this.geo = inst.geo; this.attrs = inst.attrs;
    this.mesh = new THREE.Mesh(this.geo, fogShader({ uniforms: { uMap: { value: tex }, uRight: U.camRight, uUp: U.camUp }, vertexShader: SPRITE_VERT, fragmentShader: SPRITE_FRAG }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  add(x, y, z, w, h, rot, uv, px, py, fx, fy, r, g, b, glowAmt) {
    if (this.n >= this.max) return;
    const i = this.n++, A = this.a;
    A.aPos[i * 3] = x; A.aPos[i * 3 + 1] = y; A.aPos[i * 3 + 2] = z;
    A.aSize[i * 2] = w; A.aSize[i * 2 + 1] = h; A.aRot[i] = rot;
    A.aUV[i * 4] = uv[0]; A.aUV[i * 4 + 1] = uv[1]; A.aUV[i * 4 + 2] = uv[2]; A.aUV[i * 4 + 3] = uv[3];
    A.aCol[i * 4] = r; A.aCol[i * 4 + 1] = g; A.aCol[i * 4 + 2] = b; A.aCol[i * 4 + 3] = glowAmt;
    A.aPiv[i * 4] = px; A.aPiv[i * 4 + 1] = py; A.aPiv[i * 4 + 2] = fx; A.aPiv[i * 4 + 3] = fy;
  }
  end() {
    this.geo.instanceCount = this.n; this.mesh.visible = this.n > 0;
    for (const k in this.attrs) this.attrs[k].needsUpdate = true;
  }
}
const RIB_VERT = /* glsl */`
attribute vec4 aColor; attribute float aSide;
varying vec4 vColor; varying float vSide;
void main() { vColor = aColor; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FRAG = /* glsl */`
varying vec4 vColor; varying float vSide;
void main() {
  float s = abs(vSide);
  float a = vColor.a * (1.0 - s * s);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * (1.0 + (1.0 - s) * 1.2), a);
}`;
const _rd = new THREE.Vector3(), _rv = new THREE.Vector3(), _rn = new THREE.Vector3();
const _q0 = new THREE.Vector3(), _q1 = new THREE.Vector3(), _q2 = new THREE.Vector3(), _q3 = new THREE.Vector3();
class Ribbons {
  constructor(max, order) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 12); this.col = new Float32Array(max * 16); this.side = new Float32Array(max * 4);
    const idx = new Uint16Array(max * 6);
    for (let q = 0; q < max; q++) { const v = q * 4, o = q * 6; idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3; }
    const geo = new THREE.BufferGeometry();
    const mk = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(this.pos, 3); this.aCol = mk(this.col, 4); this.aSide = mk(this.side, 1);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol); geo.setAttribute('aSide', this.aSide);
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.setDrawRange(0, 0);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: RIB_VERT, fragmentShader: RIB_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  quad(p0, p1, p2, p3, c0, a0, c1, a1, soft) {
    if (this.n >= this.max) return;
    const q = this.n++, P = this.pos, Cc = this.col, Sd = this.side;
    const pts = [p0, p1, p2, p3], cs = [c0, c0, c1, c1], as = [a0, a0, a1, a1];
    for (let k = 0; k < 4; k++) {
      const p = pts[k], c = cs[k], o3 = q * 12 + k * 3, o4 = q * 16 + k * 4;
      P[o3] = p.x; P[o3 + 1] = p.y; P[o3 + 2] = p.z;
      Cc[o4] = c.r; Cc[o4 + 1] = c.g; Cc[o4 + 2] = c.b; Cc[o4 + 3] = as[k];
      Sd[q * 4 + k] = soft ? (k === 0 || k === 3 ? -1 : 1) : 0;
    }
  }
  quadA(p0, p1, p2, p3, c, a0, a1, a2, a3) {
    if (this.n >= this.max) return;
    const q = this.n++, P = this.pos, Cc = this.col, Sd = this.side;
    const pts = [p0, p1, p2, p3], as = [a0, a1, a2, a3];
    for (let k = 0; k < 4; k++) {
      const p = pts[k], o3 = q * 12 + k * 3, o4 = q * 16 + k * 4;
      P[o3] = p.x; P[o3 + 1] = p.y; P[o3 + 2] = p.z;
      Cc[o4] = c.r; Cc[o4 + 1] = c.g; Cc[o4 + 2] = c.b; Cc[o4 + 3] = as[k];
      Sd[q * 4 + k] = 0;
    }
  }
  seg(a, b, wa, wb, c0, a0, c1 = c0, a1 = a0) {
    _rd.subVectors(b, a); _rv.subVectors(camera.position, a); _rn.crossVectors(_rd, _rv);
    const L = _rn.length();
    if (L < 1e-6) return;
    _rn.multiplyScalar(1 / L);
    _q0.copy(a).addScaledVector(_rn, -wa / 2); _q1.copy(a).addScaledVector(_rn, wa / 2);
    _q2.copy(b).addScaledVector(_rn, wb / 2); _q3.copy(b).addScaledVector(_rn, -wb / 2);
    this.quad(_q0, _q1, _q2, _q3, c0, a0, c1, a1, true);
  }
  end() {
    this.geo.setDrawRange(0, this.n * 6);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSide.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }
}
const sprites = new SpriteBatch(600, weaponsTex, 4);
const ribbons = new Ribbons(1500, 18);
