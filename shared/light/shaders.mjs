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
uniform vec3 uLightDirection;
uniform float uDirectionalStrength;
uniform float uLightCutoff;
uniform float uLightSoftness;
uniform float uShadowFloor;
uniform float uThicknessVariation;

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
    if (ringMin(uv, px, 2.0) < 0.5) return 2.0;
    if (ringMin(uv, px, 5.0) < 0.5) return 5.0;
    if (ringMin(uv, px, 10.0) < 0.5) return 10.0;
    if (ringMin(uv, px, 18.0) < 0.5) return 18.0;
    return 32.0;
  }
  if (ringMax(uv, px, 2.0) > 0.5) return 2.0;
  if (ringMax(uv, px, 5.0) > 0.5) return 5.0;
  if (ringMax(uv, px, 10.0) > 0.5) return 10.0;
  if (ringMax(uv, px, 18.0) > 0.5) return 18.0;
  return 32.0;
}

vec2 projectedEdgeNormal(vec2 uv, vec2 px) {
  vec2 margin = px * 2.1;
  vec2 safeUv = clamp(uv, margin, vec2(1.0) - margin);
  float left = maskAt(safeUv - vec2(px.x * 2.0, 0.0));
  float right = maskAt(safeUv + vec2(px.x * 2.0, 0.0));
  float down = maskAt(safeUv - vec2(0.0, px.y * 2.0));
  float up = maskAt(safeUv + vec2(0.0, px.y * 2.0));
  vec2 g = vec2(left - right, down - up);
  float len = length(g);
  return len > 0.0001 ? g / len : vec2(0.0, 1.0);
}

vec3 nearbySurfaceNormal(vec2 uv, vec2 px) {
  vec3 sum = vec3(0.0);
  float weight = 0.0;
  float m = maskAt(uv);
  sum += normalAt(uv) * m;
  weight += m;

  vec2 dx = vec2(px.x * 2.0, 0.0);
  vec2 dy = vec2(0.0, px.y * 2.0);
  float ml = maskAt(uv - dx);
  float mr = maskAt(uv + dx);
  float md = maskAt(uv - dy);
  float mu = maskAt(uv + dy);
  sum += normalAt(uv - dx) * ml;
  sum += normalAt(uv + dx) * mr;
  sum += normalAt(uv - dy) * md;
  sum += normalAt(uv + dy) * mu;
  weight += ml + mr + md + mu;

  return weight > 0.001 ? normalize(sum / weight) : vec3(0.0, 0.0, 1.0);
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
  float in1 = center * (1.0 - ringMin(vUv, px, 1.0));
  float in3 = center * (1.0 - ringMin(vUv, px, 3.0));
  float in7 = center * (1.0 - ringMin(vUv, px, 7.0));
  float out1 = (1.0 - center) * ringMax(vUv, px, 1.0);
  float out3 = (1.0 - center) * ringMax(vUv, px, 3.0);
  float out7 = (1.0 - center) * ringMax(vUv, px, 7.0);
  float out15 = (1.0 - center) * ringMax(vUv, px, 15.0);

  float edge1 = max(in1, out1);
  float edge3 = max(in3, out3);
  float edge7 = max(in7, out7);
  float distancePx = approximateDistance(vUv, px, center);

  vec3 n = nearbySurfaceNormal(vUv, px);
  float fresnel = pow(clamp(1.0 - abs(n.z), 0.0, 1.0), uRimPower);
  float depth = depthAt(vUv);
  float depthDx = abs(depth - depthAt(vUv + vec2(px.x * 2.0, 0.0)));
  float depthDy = abs(depth - depthAt(vUv + vec2(0.0, px.y * 2.0)));
  float depthEdge = clamp((depthDx + depthDy) * 9.0, 0.0, 1.0);

  vec3 lightDir = normalize(uLightDirection);
  vec2 lightDir2 = normalize(lightDir.xy + vec2(0.0001));
  vec2 edgeDir = projectedEdgeNormal(vUv, px);
  float surfaceLight = max(dot(n, lightDir), 0.0);
  float projectedLight = max(dot(edgeDir, lightDir2), 0.0);
  float lightSignal = clamp(surfaceLight * 0.58 + projectedLight * 0.42 + depthEdge * 0.08, 0.0, 1.0);

  float stableVariation = (hash21(floor(gl_FragCoord.xy * 0.075)) - 0.5) * 0.08;
  float cutoff = clamp(uLightCutoff + stableVariation, 0.0, 0.95);
  float lit = smoothstep(cutoff, cutoff + max(0.01, uLightSoftness), lightSignal);
  float directionMix = clamp(uDirectionalStrength, 0.0, 1.0);
  float visibility = mix(1.0, mix(clamp(uShadowFloor, 0.0, 1.0), 1.0, lit), directionMix);
  float thickness = clamp(lit * uThicknessVariation * directionMix, 0.0, 1.0);

  float core = clamp(edge1 + max(edge3 - edge1, 0.0) * thickness * 0.22, 0.0, 1.0);
  float gold = clamp(edge3 - edge1 * 0.70 + edge7 * thickness * 0.24, 0.0, 1.0);
  float halo = clamp(
    out15 * (0.34 + thickness * 0.42) +
    out7 * (0.34 + thickness * 0.34) -
    out3 * 0.66,
    0.0,
    1.0
  );

  float spatial = hash21(floor(gl_FragCoord.xy * 0.45));
  float filament = step(uFilamentThreshold, spatial) * clamp(edge7 - edge1, 0.0, 1.0);
  filament *= 1.0 - smoothstep(7.0, 18.0, distancePx);
  filament *= 0.76 + 0.24 * sin(vUv.y * 920.0 + vUv.x * 437.0);

  float rim = mix(0.62, 1.34, fresnel);
  rim += depthEdge * uDepthGain;
  float breathe = 0.985 + 0.015 * sin(uTime * 1.65);
  float art = zoneGain(vUv.y);
  float brightWidth = 0.78 + thickness * 0.46;

  vec3 energy = vec3(0.0);
  energy += uAmberColor * halo * uHaloGain * brightWidth;
  energy += uGoldColor * gold * uGoldGain * rim * brightWidth;
  energy += uCoreColor * core * uCoreGain * (0.80 + lightSignal * 0.42 + fresnel * 0.18);
  energy += uGoldColor * filament * uFilamentGain * (0.45 + lit * 0.85);
  energy *= art * breathe * visibility;

  float contour = max(core, gold * 0.55);
  float aa = smoothstep(0.0, max(0.05, uEdgeSoftness), contour + halo * 0.22);
  gl_FragColor = vec4(energy * max(aa, halo * 0.30), 1.0);
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
