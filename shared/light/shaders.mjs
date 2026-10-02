export const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;

export const LIGHT_EXTRACT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tMask;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uCoreColor;
uniform vec3 uGoldColor;
uniform vec3 uAmberColor;
uniform float uCoreGain;
uniform float uGoldGain;
uniform float uHaloGain;
uniform float uRimPower;
uniform float uDepthGain;
uniform float uFilamentGain;
uniform float uFilamentThreshold;
uniform float uEdgeSoftness;
uniform vec3 uZoneGain;

float maskAt(vec2 uv) {
  return texture2D(tMask, clamp(uv, 0.0, 1.0)).r;
}

float depthAt(vec2 uv) {
  return texture2D(tDepth, clamp(uv, 0.0, 1.0)).r;
}

vec3 normalAt(vec2 uv) {
  return normalize(texture2D(tNormal, clamp(uv, 0.0, 1.0)).xyz * 2.0 - 1.0);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float ringMax(vec2 uv, vec2 px, float radius) {
  float m = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0 * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    m = max(m, maskAt(uv + d * px * radius));
  }
  return m;
}

float ringMin(vec2 uv, vec2 px, float radius) {
  float m = 1.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0 * 6.2831853;
    vec2 d = vec2(cos(a), sin(a));
    m = min(m, maskAt(uv + d * px * radius));
  }
  return m;
}

float approximateDistance(vec2 uv, vec2 px, float center) {
  if (center > 0.5) {
    float r2i = ringMin(uv, px, 2.0);
    float r5i = ringMin(uv, px, 5.0);
    float r10i = ringMin(uv, px, 10.0);
    float r18i = ringMin(uv, px, 18.0);
    if (r2i < 0.5) return 2.0;
    if (r5i < 0.5) return 5.0;
    if (r10i < 0.5) return 10.0;
    if (r18i < 0.5) return 18.0;
    return 32.0;
  }
  float r2 = ringMax(uv, px, 2.0);
  float r5 = ringMax(uv, px, 5.0);
  float r10 = ringMax(uv, px, 10.0);
  float r18 = ringMax(uv, px, 18.0);
  if (r2 > 0.5) return 2.0;
  if (r5 > 0.5) return 5.0;
  if (r10 > 0.5) return 10.0;
  if (r18 > 0.5) return 18.0;
  return 32.0;
}

float zoneGain(float y) {
  float topW = smoothstep(0.48, 0.88, y);
  float bottomW = 1.0 - smoothstep(0.10, 0.52, y);
  float middleW = max(0.0, 1.0 - max(topW, bottomW));
  return max(0.2,
    topW * uZoneGain.x +
    middleW * uZoneGain.y +
    bottomW * uZoneGain.z
  );
}

void main() {
  vec2 px = 1.0 / max(uResolution, vec2(1.0));
  float center = maskAt(vUv);
  float nearOutside = ringMax(vUv, px, 2.0);
  float insideMin = ringMin(vUv, px, 2.0);

  float innerEdge = center * (1.0 - insideMin);
  float outsideEdge = (1.0 - center) * nearOutside;
  float contour = max(innerEdge, outsideEdge);

  vec3 n = normalAt(vUv);
  float fresnel = pow(clamp(1.0 - abs(n.z), 0.0, 1.0), uRimPower);
  float depth = depthAt(vUv);
  float depthDx = abs(depth - depthAt(vUv + vec2(px.x * 2.0, 0.0)));
  float depthDy = abs(depth - depthAt(vUv + vec2(0.0, px.y * 2.0)));
  float depthEdge = clamp((depthDx + depthDy) * 9.0, 0.0, 1.0);

  float distancePx = approximateDistance(vUv, px, center);
  float core = smoothstep(3.0, 1.5, distancePx) * (0.72 + contour * 0.28);
  float gold = smoothstep(9.5, 2.0, distancePx) * (1.0 - core * 0.58);
  float halo = (1.0 - center) * smoothstep(24.0, 4.5, distancePx) * (1.0 - gold * 0.55);

  float spatial = hash21(floor(gl_FragCoord.xy * 0.45));
  float filament = step(uFilamentThreshold, spatial) * smoothstep(13.0, 1.0, distancePx);
  filament *= 0.76 + 0.24 * sin(vUv.y * 920.0 + vUv.x * 437.0);

  float rim = mix(0.70, 1.28, fresnel);
  rim += depthEdge * uDepthGain;
  float breathe = 0.985 + 0.015 * sin(uTime * 1.65);
  float art = zoneGain(vUv.y);

  vec3 energy = vec3(0.0);
  energy += uAmberColor * halo * uHaloGain;
  energy += uGoldColor * gold * uGoldGain * rim;
  energy += uCoreColor * core * uCoreGain * (0.88 + fresnel * 0.28);
  energy += uGoldColor * filament * uFilamentGain;
  energy *= art * breathe;

  float aa = smoothstep(0.0, max(0.05, uEdgeSoftness), contour + gold * 0.4);
  gl_FragColor = vec4(energy * max(aa, halo * 0.35), 1.0);
}`;

export const TEMPORAL_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform float uHistoryWeight;
void main() {
  vec3 current = texture2D(tCurrent, vUv).rgb;
  vec3 history = texture2D(tHistory, vUv).rgb;
  float delta = length(current - history);
  float motionReject = exp(-delta * 4.0);
  float historyWeight = clamp(uHistoryWeight * motionReject, 0.0, 0.94);
  vec3 stable = mix(current, history, historyWeight);
  gl_FragColor = vec4(stable, 1.0);
}`;

export const KAWASE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uResolution;
uniform float uRadius;
void main() {
  vec2 px = uRadius / max(uResolution, vec2(1.0));
  vec3 sum = texture2D(tInput, vUv).rgb * 0.20;
  sum += texture2D(tInput, vUv + vec2( px.x,  px.y)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(-px.x,  px.y)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2( px.x, -px.y)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(-px.x, -px.y)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(px.x * 2.0, 0.0)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(-px.x * 2.0, 0.0)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(0.0, px.y * 2.0)).rgb * 0.10;
  sum += texture2D(tInput, vUv + vec2(0.0, -px.y * 2.0)).rgb * 0.10;
  gl_FragColor = vec4(sum, 1.0);
}`;

export const COMPOSITE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tLight;
uniform sampler2D tBloom;
uniform float uBloomGain;
void main() {
  vec3 base = texture2D(tColor, vUv).rgb;
  vec3 light = texture2D(tLight, vUv).rgb;
  vec3 bloom = texture2D(tBloom, vUv).rgb;
  vec3 hdr = base + light + bloom * uBloomGain;
  vec3 mapped = hdr / (vec3(1.0) + hdr);
  mapped = pow(mapped, vec3(1.0 / 2.2));
  gl_FragColor = vec4(mapped, 1.0);
}`;

export const COPY_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tInput;
void main() {
  gl_FragColor = texture2D(tInput, vUv);
}`;
