'use strict';
// Original procedural visual styles only; rights-unverified reference assets
// are not substituted into shader or material outputs.
const PALETTES = Object.freeze([
  ['#07111c', '#162e44', '#75d5ea', '#e8f5ff'],
  ['#130b1f', '#43235b', '#f7a7df', '#fff2ca'],
  ['#111317', '#3b3935', '#fdc274', '#fcf5e5'],
  ['#070e13', '#25403d', '#73e7a5', '#e0fff3'],
  ['#191113', '#623c35', '#ff9a65', '#ffeecf']
]);
const LAYERS = Object.freeze(['far', 'mid', 'near', 'screen']);
function object(v, name) {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new TypeError(name + ' must be an object');
  return v;
}
function number(v, name, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new TypeError(name + ' must be finite in [' + min + ', ' + max + ']');
  return v;
}
function lum(color) {
  const a = color.slice(1).match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const values = a.map(x => x <= .04045 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4));
  return .2126 * values[0] + .7152 * values[1] + .0722 * values[2];
}
function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
function hashSeed(seed, laws) {
  let hash = 2166136261;
  for (const char of String(seed) + '|' + laws.join('|')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}
function createStyleSheet({ physics, world_laws, referenceIds = [],
    performanceBudget, randomSeed } = {}) {
  object(physics, 'physics');
  object(physics.collisions, 'physics.collisions');
  if (physics.collisions.solid !== true || physics.units !== 'SI')
    throw new TypeError('physics must preserve solid SI collisions');
  number(physics.gravity, 'physics.gravity', 0.000001, 100);
  if (!Array.isArray(world_laws) || world_laws.some(x => typeof x !== 'string' || !x.trim()))
    throw new TypeError('world_laws must be an array of nonempty strings');
  if (!Array.isArray(referenceIds) || referenceIds.some(x => typeof x !== 'string'))
    throw new TypeError('referenceIds must be an array of IDs');
  if (referenceIds.length) throw new Error('Reference assets require a separately verified licensing pipeline');
  object(performanceBudget, 'performanceBudget');
  const fps = number(performanceBudget.targetFps, 'performanceBudget.targetFps', 20, 120);
  if (!Number.isSafeInteger(randomSeed)) throw new TypeError('randomSeed must be a safe integer');
  const key = hashSeed(randomSeed, world_laws);
  const palette = [...PALETTES[key % PALETTES.length]];
  if (contrast(palette[0], palette[2]) < 4.5)
    throw new Error('Generated hero silhouette lacks foreground contrast');
  const fogLaw = world_laws.some(x => /fog|mist|туман|дым|пар/i.test(x));
  const stormLaw = world_laws.some(x => /storm|rain|гроза|дождь|молния/i.test(x));
  const fogDensity = fogLaw ? 0.045 : 0.018;
  const reduced = fps < 45;
  const vertexShader = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 position;',
    'in vec2 uv;',
    'uniform mat4 modelViewMatrix;',
    'uniform mat4 projectionMatrix;',
    'out vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');
  const fragmentShader = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUv;',
    'out vec4 fragColor;',
    'uniform float uTime;',
    'uniform float uFogDensity;',
    'uniform vec3 uFogColor;',
    'uniform vec3 uAccentColor;',
    'float hash(vec2 p){',
    '  return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);',
    '}',
    'float noise2(vec2 p){',
    '  vec2 i=floor(p), f=fract(p);',
    '  f=f*f*(3.0-2.0*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),',
    '             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);',
    '}',
    'void main(){',
    '  vec2 drift = vec2(vUv.x*3.2 + uTime*0.018, vUv.y*2.1-uTime*0.009);',
    '  float mist = noise2(drift);',
    reduced ? '  float bands = mist;' :
      '  float bands = 0.65*mist + 0.35*noise2(drift*2.0+vec2(8.0));',
    '  float horizon = smoothstep(0.0, 1.0, 1.0-vUv.y);',
    '  float opacity = clamp((0.10 + bands*0.42) * horizon *',
    '     (uFogDensity/0.045), 0.0, 0.68);',
    '  vec3 mistColor = mix(uFogColor, uAccentColor, bands*0.18);',
    '  fragColor = vec4(mistColor, opacity);',
    '}'
  ].join('\n');
  return {
    format: 'three-glsl3-procedural', generatedFrom: 'original_shader_code',
    randomSeed, palette, referenceIds: [], tiles: [], sprites: [],
    layers: [...LAYERS],
    lighting: { fog: { density: fogDensity, color: palette[1] },
      ambientIntensity: stormLaw ? 0.28 : 0.42,
      lightningEnabled: stormLaw, bloomEnabled: !reduced },
    particles: { enabled: !reduced, maximum: reduced ? 0 : 120 },
    ui_icons: ['health', 'pause', 'move', 'interact'],
    shaders: { atmosphere: { glslVersion: '300 es', vertexShader, fragmentShader,
      uniforms: { uTime: 0, uFogDensity: fogDensity,
        uFogColor: palette[1], uAccentColor: palette[2] },
      transparency: true, depthWrite: false } },
    performanceBudget: { targetFps: fps, reducedEffects: reduced },
    requiredRendering: { WebGL2: true, texturesFromUnverifiedSources: false }
  };
}
module.exports = { createStyleSheet, contrast };
