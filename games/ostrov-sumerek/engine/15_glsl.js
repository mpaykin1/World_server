/* -----------------------------------------------------------------------------
   5 · GLSL
----------------------------------------------------------------------------- */
const GLSL_HASH = /* glsl */`
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.17; a *= 0.5; } return s; }
`;
const FOG_ATTEN = /* glsl */`
  #ifdef USE_FOG
    a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #endif
`;

const WATER_VERT = /* glsl */`
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FRAG = /* glsl */`
uniform sampler2D uTex;
uniform sampler2D uHeight;
uniform float uTime, uSea;
uniform vec3 uDeep, uShallow, uFoam, uSky, uSunCol, uSunDir;
uniform vec4 uRipples[8];
varying vec3 vWorld;
#include <fog_pars_fragment>
${GLSL_HASH}
void main() {
  vec2 wp = vWorld.xz;
  vec2 pp = (floor(wp * 16.0) + 0.5) / 16.0;                  // effects live on the 16-texel grid
  float ground = texture2D(uHeight, pp / vec2(${W}.0, ${D}.0)).r * 16.0;
  float depth = uSea - ground;
  float dist = length(vWorld - cameraPosition);
  float frame = mod(floor(uTime * 4.0), 4.0);
  vec3 tex = texture2D(uTex, vec2((fract(wp.x) + frame) * 0.25, fract(wp.y))).rgb;
  float tl = dot(tex, vec3(0.3, 0.5, 0.2));
  vec3 col = mix(uShallow, uDeep, smoothstep(0.25, 2.6, depth));
  float detail = 1.0 - smoothstep(26.0, 64.0, dist);
  col *= mix(1.0, 0.62 + tl * 1.45, detail);
  float shore = 1.0 - smoothstep(0.05, 1.3, depth);
  float band = fract(depth * 1.35 - uTime * 0.3 + h12(floor(pp * 2.0)) * 0.12);
  float foam = shore * step(0.74, band) * detail + smoothstep(0.32, 0.02, depth);
  for (int i = 0; i < 8; i++) {
    vec4 r = uRipples[i];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 1.5) {
      float ring = abs(length(pp - r.xy) - age * 1.4);
      foam += step(ring, 0.06) * (1.0 - age / 1.5) * r.w;
    }
  }
  foam = clamp(foam, 0.0, 1.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
  col = mix(col, uSky, fres * 0.4);
  col += uSunCol * smoothstep(0.3, 0.5, tl) * detail * 0.14;   // pixel crests catch the key light
  vec3 Rf = reflect(-V, vec3(0.0, 1.0, 0.0));
  float sd = max(dot(Rf, uSunDir), 0.0);
  float glint = step(0.975, h12(pp * 3.7 + floor(uTime * 5.0))) * pow(sd, 40.0);
  col += uSunCol * (pow(sd, 160.0) * 1.2 + glint * 3.5);
  col = mix(col, uFoam, foam * 0.9);
  float alpha = mix(0.42, 0.93, smoothstep(0.1, 2.0, depth));
  alpha = max(alpha, foam * 0.95);
  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */`
uniform vec3 uTop, uHorizon, uBottom, uSunCol, uSunDir, uMoonDir, uAuroraA, uAuroraB;
uniform float uTime, uNight, uSunVis, uAurora;
varying vec3 vDir;
${GLSL_HASH}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, uBottom, smoothstep(0.0, -0.22, h));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * uSunVis * (pow(s, 1400.0) * 40.0 + pow(s, 60.0) * 0.9 + pow(s, 7.0) * 0.35);
  if (h > -0.03) {                                    // pixel-stepped dusk clouds
    vec2 cp = floor(d.xz / (h + 0.18) * 22.0) / 22.0;
    float c = fbm(cp * vec2(0.9, 2.6) + vec2(uTime * 0.006, 0.0));
    float m = smoothstep(0.55, 0.78, c) * smoothstep(-0.02, 0.06, h) * (1.0 - smoothstep(0.26, 0.55, h));
    vec3 lit = mix(uHorizon * 0.55, uSunCol * 1.15, pow(s, 3.0) * uSunVis + 0.15);
    col = mix(col, lit, m * 0.75);
  }
  if (uAurora > 0.001 && h > 0.0) {                  // aurora: pixel-stepped curtains swaying along the horizon
    float az = atan(d.z, d.x);
    float qa = floor(az * 120.0) / 120.0, qh = floor(h * 120.0) / 120.0;
    float e = 0.06 + 0.045 * sin(qa * 3.0 + uTime * 0.11) + 0.025 * sin(qa * 7.0 - uTime * 0.23) + 0.015 * sin(qa * 13.0 + uTime * 0.4);
    float above = qh - e;
    float curtain = above > 0.0 ? exp(-above * 4.5) : exp(above * 50.0);    // hangs low: seen behind the island, not only overhead
    float rays = 0.55 + 0.45 * sin(qa * 70.0 + sin(qa * 9.0 + uTime * 0.3) * 4.0 + uTime * 0.5);
    float vis = (0.5 + 0.5 * sin(qa * 2.0 - uTime * 0.05)) * smoothstep(0.0, 0.05, h);
    col += mix(uAuroraA, uAuroraB, clamp(above * 5.0, 0.0, 1.0)) * curtain * rays * vis * uAurora * 1.6;
  }
  vec3 sd = d * 160.0;
  vec3 cell = floor(sd);
  float r = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
  float star = step(0.986, r) * smoothstep(0.02, 0.2, h) * step(length(fract(sd) - 0.5), 0.32);
  col += vec3(0.85, 0.9, 1.0) * star * tw * uNight * 2.2;
  float m2 = dot(d, uMoonDir);
  col += vec3(0.8, 0.85, 1.0) * uNight * (step(0.99955, m2) * 2.4 + pow(max(m2, 0.0), 90.0) * 0.4);
  gl_FragColor = vec4(col, 1.0);
}`;

const MIST_VERT = /* glsl */`
varying vec3 vWorld; varying float vDepth;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vec4 mv = viewMatrix * wp; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const MIST_FRAG = /* glsl */`
uniform sampler2D uHeight;
uniform float uTime, uAlpha, uLayer;
uniform vec3 uColor;
uniform vec2 uDrift;
varying vec3 vWorld; varying float vDepth;
${GLSL_HASH}
void main() {
  vec2 cell = floor(vWorld.xz * 4.0) / 4.0;                   // quarter-block mist pixels
  float n = smoothstep(0.42, 0.8, fbm(cell * 0.07 + uDrift * uTime));
  float ground = texture2D(uHeight, cell / vec2(${W}.0, ${D}.0)).r * 16.0;
  float clear = smoothstep(uLayer - 0.15, uLayer - 0.75, ground);
  float a = n * clear * smoothstep(3.0, 11.0, vDepth) * (1.0 - smoothstep(70.0, 150.0, vDepth)) * uAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

const PICK_VERT = /* glsl */`
attribute vec3 aPos; attribute float aPhase; attribute float aAlive;
uniform float uTime, uFrames, uCells, uFps, uBob, uSize;
uniform vec3 uRight;
varying vec2 vUv; varying float vAlive;
#include <fog_pars_vertex>
void main() {
  float bob = sin(uTime * 2.3 + aPhase * 6.2831) * uBob;
  vec3 c = aPos + vec3(0.0, bob, 0.0);
  float s = uSize * aAlive;
  vec3 wp = c + uRight * (position.x * s) + vec3(0.0, position.y * s, 0.0);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float fr = mod(floor(uTime * uFps + aPhase * 13.0), uFrames);
  vUv = vec2((uv.x + fr) / uCells, uv.y);
  vAlive = aAlive;
  #include <fog_vertex>
}`;
const PICK_FRAG = /* glsl */`
uniform sampler2D uMap; uniform float uGlow;
varying vec2 vUv; varying float vAlive;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.5 || vAlive < 0.01) discard;
  float l = dot(c.rgb, vec3(0.3, 0.55, 0.15));
  gl_FragColor = vec4(c.rgb * (1.0 + uGlow * l * l * 3.0), 1.0);
  #include <fog_fragment>
}`;
const HALO_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uIntensity, uTime;
varying vec2 vUv; varying float vAlive;
#include <fog_pars_fragment>
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = pow(max(0.0, 1.0 - length(p)), 2.4) * uIntensity * vAlive * (0.85 + 0.15 * sin(uTime * 3.1));
  ${FOG_ATTEN}
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uIntensity, uTime;
varying vec2 vUv; varying float vAlive;
#include <fog_pars_fragment>
void main() {
  float x = abs(vUv.x * 2.0 - 1.0);
  float a = pow(1.0 - vUv.y, 1.6) * pow(1.0 - x, 2.0) * uIntensity * vAlive;
  a *= 0.75 + 0.25 * sin(uTime * 2.6 + vUv.y * 9.0);
  #ifdef USE_FOG
    a *= exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.45);
  #endif
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor, a);
}`;

// segmented foes: one billboard per body segment. aFx = (hit flash, frost, burn, shock), aKind = 0 shade · 1 imp · 2 warden
