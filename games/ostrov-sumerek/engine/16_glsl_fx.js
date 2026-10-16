/* -----------------------------------------------------------------------------
   5b · Shaders, part two: foes (smoke / jelly bodies, auras), particles, fireflies,
        beacon flame, ring, light beams, shadow, depth of field and the final grade
----------------------------------------------------------------------------- */
const SHADE_VERT = /* glsl */`
attribute vec3 aPos; attribute float aRad; attribute float aAlpha; attribute float aSeed; attribute vec4 aFx; attribute float aKind;
uniform vec3 uRight, uUp; uniform float uScale;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec4 vFx; varying float vKind;
#include <fog_pars_vertex>
void main() {
  float s = aRad * 2.0 * uScale * (1.0 + aFx.x * 0.1);       // a hit makes the segment swell for a moment
  vec3 wp = aPos + uRight * (position.x * s) + uUp * (position.y * s);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv; vAlpha = aAlpha; vSeed = aSeed; vFx = aFx; vKind = aKind;
  #include <fog_vertex>
}`;
const SHADE_FRAG = /* glsl */`
uniform float uTime; uniform vec3 uCoreK[16]; uniform vec3 uRimK[16]; uniform vec4 uShapeK[16];
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec4 vFx; varying float vKind;
#include <fog_pars_fragment>
void main() {
  int k = int(vKind + 0.5);
  vec4 shp = uShapeK[k];                                      // spikes, pixel grid, aura gain, style
  vec2 q = (floor(vUv * shp.y) + 0.5) / shp.y;                // pixel-art silhouette
  vec2 p = q * 2.0 - 1.0;
  float r = length(p), an = atan(p.y, p.x);
  float rimK, a = vAlpha;
  if (shp.w > 0.5) {
    // style 1 · jelly bell: a dome with a frilled, rippling skirt; light glows through it
    float pulse = 0.07 * sin(uTime * 3.0 + vSeed);
    vec2 b = vec2(p.x * (1.0 + pulse), p.y + 0.16);
    float dome = length(vec2(b.x, b.y * (b.y > 0.0 ? 1.15 : 2.8)));
    float skirt = -0.44 + 0.07 * sin(p.x * 13.0 + uTime * 6.0 + vSeed * 3.0);
    if (dome > 0.86 || p.y < skirt || vAlpha < 0.01) discard;
    rimK = smoothstep(0.5, 0.84, dome);
    a *= mix(0.6, 0.95, rimK);
  } else {
    // style 0 · smoke blob: a wobbling, bristling edge (spikes for the warden)
    float spikes = shp.x * pow(abs(sin(an * 4.0 + vSeed)), 6.0);
    float edge = 0.84 + 0.09 * sin(an * 5.0 + uTime * 4.0 + vSeed * 7.0) + 0.05 * sin(an * 9.0 - uTime * 6.5 + vSeed) + spikes;
    if (r > edge || vAlpha < 0.01) discard;
    rimK = smoothstep(edge - 0.34, edge - 0.04, r);
  }
  vec3 col = mix(uCoreK[k], uRimK[k], rimK);
  if (shp.w > 0.5) col += uRimK[k] * smoothstep(0.34, 0.0, length(p - vec2(0.0, 0.2))) * 1.4;   // the bell's glowing heart
  // status effects: frost tints the whole body, burning and shock light up the rim
  col = mix(col, vec3(0.3, 0.55, 0.8) * (0.45 + 0.55 * rimK), vFx.y * 0.8);
  float flick = 0.6 + 0.4 * sin(uTime * 24.0 + vSeed * 5.0 + an * 3.0);
  col += vec3(1.0, 0.42, 0.08) * vFx.z * rimK * flick * 1.7;
  col += vec3(0.4, 0.95, 1.0) * vFx.w * rimK * step(0.5, fract(uTime * 17.0 + vSeed + an * 0.8)) * 2.2;
  col = mix(col, vec3(1.0, 0.86, 0.95) * 1.15, vFx.x * 0.7);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;
const AURA_FRAG = /* glsl */`
uniform float uTime; uniform vec3 uAuraK[16]; uniform vec4 uShapeK[16];
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying vec4 vFx; varying float vKind;
#include <fog_pars_fragment>
void main() {
  int k = int(vKind + 0.5);
  float r = length(vUv * 2.0 - 1.0);
  vec3 c = uAuraK[k];
  c = mix(c, vec3(1.0, 0.45, 0.1), vFx.z * 0.75);
  c = mix(c, vec3(0.35, 0.8, 1.0), max(vFx.y, vFx.w) * 0.7);
  float a = smoothstep(1.0, 0.4, r) * 0.3 * vAlpha * (0.8 + 0.2 * sin(uTime * 5.0 + vSeed * 3.0)) * (1.0 + vFx.x * 0.8) * uShapeK[k].z;
  #ifdef USE_FOG
    a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.6);
  #endif
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;

const PART_VERT = /* glsl */`
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aShape;
uniform float uScale, uFogD;
varying vec3 vColor; varying float vAlpha; varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 0.1);
  gl_PointSize = clamp(aSize * uScale / d, 1.0, 220.0);
  vColor = aColor; vShape = aShape;
  vAlpha = aAlpha * exp(-uFogD * uFogD * d * d * 0.7);
}`;
const PART_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha; varying float vShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a;
  if (vShape < 0.5) a = pow(max(0.0, 1.0 - length(p)), 1.6);
  else if (vShape < 1.5) a = 1.0;
  else { vec2 ap = abs(p); a = max(max(step(ap.x, 0.2) * step(ap.y, 0.95), step(ap.y, 0.2) * step(ap.x, 0.95)), step(max(ap.x, ap.y), 0.36)); }
  a *= vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

const FLY_VERT = /* glsl */`
attribute float aPhase; attribute float aKind; attribute float aSpeed;
uniform float uTime, uScale, uFogD, uFly, uMote;
uniform vec3 uFlyCol, uMoteCol;
varying vec3 vColor; varying float vAlpha;
void main() {
  float t = uTime * aSpeed + aPhase * 6.2831;
  vec3 p = position;
  float a;
  if (aKind > 0.5) {
    p += vec3(sin(t * 0.7) * 1.3 + sin(t * 1.9) * 0.3, sin(t * 1.1) * 0.55, cos(t * 0.6) * 1.3 + cos(t * 1.7) * 0.3);
    a = uFly * pow(0.5 + 0.5 * sin(t * 2.7 + aPhase * 20.0), 4.0);
    vColor = uFlyCol;
  } else {
    p += vec3(sin(t * 0.31) * 1.8, sin(t * 0.23) * 0.7 + 0.25 * sin(t * 1.3), cos(t * 0.27) * 1.8);
    a = uMote * (0.35 + 0.35 * sin(t * 1.7));
    vColor = uMoteCol;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(-mv.z, 0.1);
  gl_PointSize = clamp((aKind > 0.5 ? 0.22 : 0.09) * uScale / d, 1.0, 64.0);
  vAlpha = a * exp(-uFogD * uFogD * d * d * 0.6);
}`;
const FLY_FRAG = /* glsl */`
varying vec3 vColor; varying float vAlpha;
void main() {
  float a = pow(max(0.0, 1.0 - length(gl_PointCoord * 2.0 - 1.0)), 1.8) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor, a);
}`;

const FLAME_VERT = /* glsl */`
uniform vec3 uRight; uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vec3 wp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz + uRight * position.x * uSize.x + vec3(0.0, position.y * uSize.y, 0.0);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FLAME_FRAG = /* glsl */`
uniform float uTime, uLevel;
varying vec2 vUv;
${GLSL_HASH}
void main() {
  vec2 q = (floor(vUv * vec2(10.0, 16.0)) + 0.5) / vec2(10.0, 16.0);
  float y = q.y;
  float n = vnoise(vec2(q.x * 5.0, y * 4.0 - uTime * 4.5));
  float w = (1.0 - y) * (0.55 + 0.45 * n);
  float x = abs(q.x - 0.5) * 2.0;
  if (x > w || y + n * 0.25 > 0.97 || uLevel < 0.01) discard;
  float heat = (1.0 - y) * (1.0 - x / max(w, 0.001));
  vec3 col = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.8, 0.3), smoothstep(0.12, 0.55, heat));
  col = mix(col, vec3(1.0, 1.0, 0.85), smoothstep(0.55, 0.9, heat));
  gl_FragColor = vec4(col * (2.0 + 3.0 * uLevel), 1.0);
}`;

const RING_VERT = /* glsl */`
varying vec2 vLocal;
void main() { vLocal = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
uniform float uTime, uOn;
varying vec2 vLocal;
void main() {
  vec2 q = floor(vLocal * 16.0) / 16.0;
  float an = atan(q.y, q.x);
  float dash = step(0.5, fract(an / 6.2831 * 12.0 - uTime * 0.5));
  float r = length(q);
  float a = (0.25 + 0.75 * dash) * step(0.72, r) * step(r, 1.12) * (0.1 + 0.9 * uOn) * (0.7 + 0.3 * sin(uTime * 4.0));
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.75, 0.3) * 2.2, a);
}`;

const LBEAM_VERT = /* glsl */`
varying float vT; varying vec3 vN; varying vec3 vView; varying float vDepth;
void main() {
  vT = uv.y;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - wp.xyz);
  vec4 mv = viewMatrix * wp; vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const LBEAM_FRAG = /* glsl */`
uniform float uI; uniform vec3 uColor;
varying float vT; varying vec3 vN; varying vec3 vView; varying float vDepth;
void main() {
  float f = abs(dot(normalize(vN), normalize(vView)));
  float a = pow(f, 1.8) * pow(1.0 - vT, 1.25) * uI;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const UV_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SHADOW_FRAG = /* glsl */`
uniform float uA;
varying vec2 vUv;
void main() {
  vec2 q = (floor(vUv * 12.0) + 0.5) / 12.0;
  float a = (1.0 - smoothstep(0.5, 1.0, length(q * 2.0 - 1.0))) * uA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.06, 0.03, 0.1, a);
}`;

const DOFShader = {
  uniforms: {
    tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.5 }, uBand: { value: 0.16 }, uAmount: { value: 1.6 },
  },
  vertexShader: UV_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uDir, uRes; uniform float uFocus, uBand, uAmount;
    varying vec2 vUv;
    void main() {
      float k = max(0.0, abs(vUv.y - uFocus) - uBand) * uAmount;
      vec2 st = uDir / uRes * k * 6.0;
      vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
      s += (texture2D(tDiffuse, vUv + st * 1.3846153846) + texture2D(tDiffuse, vUv - st * 1.3846153846)) * 0.3162162162;
      s += (texture2D(tDiffuse, vUv + st * 3.2307692308) + texture2D(tDiffuse, vUv - st * 3.2307692308)) * 0.0702702703;
      gl_FragColor = s;
    }`,
};
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
    uAberr: { value: 0.0015 }, uGrain: { value: 0.05 }, uGlitch: { value: 0 }, uVignette: { value: 0.35 },
    uDanger: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uDesat: { value: 0 }, uBars: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.6, 0.85) }, uDangerColor: { value: new THREE.Color(0.32, 0.03, 0.36) },
    uLift: { value: new THREE.Color(0.02, 0.0, 0.035) }, uGain: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: UV_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes;
    uniform float uTime, uAberr, uGrain, uGlitch, uVignette, uDanger, uFlash, uFade, uDesat, uBars;
    uniform vec3 uFlashColor, uDangerColor, uLift, uGain;
    varying vec2 vUv;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 uv = vUv;
      float tt = floor(uTime * 18.0);
      float band = floor(uv.y * 42.0);
      float g = step(1.0 - uGlitch * 0.45, h12(vec2(band, tt)));
      float shift = (h12(vec2(tt, band * 1.7)) - 0.5) * 0.09 * uGlitch * g;
      uv.x += shift;
      vec2 c = uv - 0.5;
      vec2 off = c * dot(c, c) * uAberr * 4.0 + vec2(shift * 0.35, 0.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      col = col * uGain + uLift * (1.0 - l);
      vec2 q = c * vec2(uRes.x / uRes.y, 1.0);
      float v = smoothstep(0.95, 0.28, length(q));
      col *= mix(1.0 - uVignette, 1.0, v);
      col = mix(col, uDangerColor, (1.0 - v) * uDanger * 0.6);
      float n = h12(gl_FragCoord.xy + fract(uTime * 7.13) * 917.0) - 0.5;
      col += n * uGrain * (1.15 - l);
      col = mix(col, uFlashColor, uFlash);
      col *= uFade;
      float bars = step(vUv.y, uBars) + step(1.0 - uBars, vUv.y);
      col = mix(col, vec3(0.0), clamp(bars, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};
