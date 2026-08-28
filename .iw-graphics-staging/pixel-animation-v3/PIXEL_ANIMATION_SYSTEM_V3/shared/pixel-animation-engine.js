(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PixelAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const VERSION = '3.0.0';
  const PROFILE_IDS = Object.freeze({ bird: 1, fire: 2, water: 3, tree: 4, grass: 5, flag: 6, monster: 7, machine: 8, glass: 9, generic: 10, character: 11, cloth: 12, smoke: 13, foliage: 14, vehicle: 15, weapon: 16, portal: 17, light: 18 });
  const DEFAULT_POLICY = Object.freeze({
    targetFps: 60,
    backendOrder: ['webgpu', 'webgl2', 'canvas2d'],
    pixelPerfect: true,
    nearestFiltering: true,
    pauseWhenHidden: true,
    features: { gpuComputeCulling: true, multiAtlasStreaming: true, regionRig: true, pipelineWarmup: true, visualRegression: true, deviceLearning: true, autoIntegrate: true },
    atlas: { padding: 2, maxSize: 4096, maxLayers: 16, streamAheadPages: 2 },
    rig: { enabled: true, softness: 0.03 },
    learning: { enabled: true, minSamples: 20, maxPolicyDelta: 0.15 },
    computeCulling: { minObjects: 1500, tiers: ['high', 'ultra'] },
    visualRegression: { frames: 8, stepMs: 83, tolerance: 0.015 },
    tiers: {
      ultra: { maxVisible: 20000, fullAnimation: 5000, mediumAnimation: 10000, resolutionScale: 1, farUpdateHz: 20, maxDpr: 2 },
      high: { maxVisible: 12000, fullAnimation: 3000, mediumAnimation: 6500, resolutionScale: 1, farUpdateHz: 15, maxDpr: 1.75 },
      medium: { maxVisible: 7000, fullAnimation: 1600, mediumAnimation: 3500, resolutionScale: 0.85, farUpdateHz: 12, maxDpr: 1.5 },
      low: { maxVisible: 3500, fullAnimation: 700, mediumAnimation: 1600, resolutionScale: 0.7, farUpdateHz: 8, maxDpr: 1.25 },
    },
    adaptive: { sampleWindowMs: 1200, downshiftBelowFps: 52, upshiftAboveFps: 58, downshiftHoldMs: 1800, upshiftHoldMs: 8000 },
  });

  const DEFAULT_PROFILES = Object.freeze({
    bird: { kind: 'bird', motion: { speed: 1, bob: 0.018, sway: 0.012, wingAmplitude: 0.065, wingFrequency: 1.8, tailAmplitude: 0.035, tailFrequency: 1.15 }, material: { shimmer: 0.16, glow: 0.08, sparkle: 0.12 } },
    fire: { kind: 'fire', motion: { speed: 1.35, bob: 0.01, sway: 0.045, waveAmplitude: 0.075, waveFrequency: 2.6 }, material: { shimmer: 0.34, glow: 0.22, sparkle: 0.18 } },
    water: { kind: 'water', motion: { speed: 0.72, bob: 0.012, sway: 0.028, waveAmplitude: 0.035, waveFrequency: 1.4 }, material: { shimmer: 0.22, glow: 0.03, sparkle: 0.06 } },
    tree: { kind: 'tree', motion: { speed: 0.42, sway: 0.026, branchAmplitude: 0.035, branchFrequency: 0.62 }, material: { shimmer: 0.03, glow: 0, sparkle: 0.01 } },
    grass: { kind: 'grass', motion: { speed: 0.65, sway: 0.052, branchAmplitude: 0.07, branchFrequency: 0.9 }, material: { shimmer: 0.02, glow: 0, sparkle: 0 } },
    flag: { kind: 'flag', motion: { speed: 0.88, sway: 0.018, waveAmplitude: 0.075, waveFrequency: 1.65 }, material: { shimmer: 0.04, glow: 0, sparkle: 0 } },
    monster: { kind: 'monster', motion: { speed: 0.92, bob: 0.022, sway: 0.012, breathAmplitude: 0.018, breathFrequency: 0.82 }, material: { shimmer: 0.04, glow: 0.025, sparkle: 0.01 } },
    machine: { kind: 'machine', motion: { speed: 1, vibration: 0.006, vibrationFrequency: 4.2 }, material: { shimmer: 0.08, glow: 0.055, sparkle: 0.025 } },
    glass: { kind: 'glass', motion: { speed: 0.45 }, material: { shimmer: 0.3, glow: 0.09, sparkle: 0.2 } },
    character: { kind: 'character', motion: { speed: 0.9, bob: 0.01, sway: 0.006, breathAmplitude: 0.012, breathFrequency: 0.7 }, material: { shimmer: 0.035, glow: 0.015, sparkle: 0.005 } },
    cloth: { kind: 'cloth', motion: { speed: 0.8, sway: 0.018, waveAmplitude: 0.06, waveFrequency: 1.45 }, material: { shimmer: 0.025, glow: 0, sparkle: 0 } },
    smoke: { kind: 'smoke', motion: { speed: 0.55, bob: 0.028, sway: 0.04, waveAmplitude: 0.05, waveFrequency: 1.1 }, material: { shimmer: 0.04, glow: 0.02, sparkle: 0 } },
    foliage: { kind: 'foliage', motion: { speed: 0.5, sway: 0.035, branchAmplitude: 0.045, branchFrequency: 0.75 }, material: { shimmer: 0.025, glow: 0, sparkle: 0.005 } },
    vehicle: { kind: 'vehicle', motion: { speed: 1, vibration: 0.0025, vibrationFrequency: 5.5 }, material: { shimmer: 0.045, glow: 0.025, sparkle: 0.01 } },
    weapon: { kind: 'weapon', motion: { speed: 1, vibration: 0.0015, vibrationFrequency: 6.5 }, material: { shimmer: 0.065, glow: 0.02, sparkle: 0.02 } },
    portal: { kind: 'portal', motion: { speed: 0.95, waveAmplitude: 0.025, waveFrequency: 1.8 }, material: { shimmer: 0.24, glow: 0.2, sparkle: 0.22 } },
    light: { kind: 'light', motion: { speed: 1.15, waveAmplitude: 0.012, waveFrequency: 2.4 }, material: { shimmer: 0.22, glow: 0.28, sparkle: 0.14 } },
  });

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fallback; }
  function nowMs() { return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now(); }
  function hashSeed(input) {
    let h = 2166136261 >>> 0;
    const s = String(input == null ? '' : input);
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function merge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : { ...(base || {}) };
    if (!patch || typeof patch !== 'object') return out;
    for (const [key, value] of Object.entries(patch)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) out[key] = merge(base[key], value);
      else out[key] = value;
    }
    return out;
  }
  function normalizePolicy(policy) { return merge(DEFAULT_POLICY, policy || {}); }
  function normalizeProfile(profile, fallbackKind) {
    const kind = (profile && profile.kind) || fallbackKind || 'generic';
    const base = DEFAULT_PROFILES[kind] || { kind: 'generic', motion: { speed: 1 }, material: {} };
    return merge(base, profile || {});
  }
  function chooseDeviceTier(info, policyInput) {
    const policy = normalizePolicy(policyInput);
    const memory = positive(info && info.deviceMemory, 4);
    const cores = positive(info && info.hardwareConcurrency, 4);
    const mobile = Boolean(info && info.mobile);
    const maxTexture = positive(info && info.maxTextureSize, 4096);
    const webgl2 = info ? info.webgl2 !== false : true;
    if (!webgl2 || memory <= 2 || cores <= 2 || maxTexture < 4096) return 'low';
    if (mobile || memory <= 4 || cores <= 4) return 'medium';
    if (memory >= 8 && cores >= 8 && maxTexture >= 8192) return 'ultra';
    return policy.tiers.high ? 'high' : 'medium';
  }
  function profileParams(profileInput) {
    const p = normalizeProfile(profileInput);
    const m = p.motion || {};
    const mat = p.material || {};
    const amp1 = positive(m.wingAmplitude, positive(m.waveAmplitude, positive(m.branchAmplitude, positive(m.breathAmplitude, positive(m.vibration, positive(m.sway, 0.01))))));
    const freq1 = positive(m.wingFrequency, positive(m.waveFrequency, positive(m.branchFrequency, positive(m.breathFrequency, positive(m.vibrationFrequency, 1)))));
    const amp2 = positive(m.tailAmplitude, positive(m.sway, 0));
    const freq2 = positive(m.tailFrequency, 1);
    return {
      kindId: PROFILE_IDS[p.kind] || PROFILE_IDS.generic,
      speed: positive(m.speed, 1), bob: positive(m.bob, 0), sway: positive(m.sway, 0),
      amp1, freq1, amp2, freq2,
      shimmer: positive(mat.shimmer, 0), glow: positive(mat.glow, 0), sparkle: positive(mat.sparkle, 0),
    };
  }

  class SpatialHashGrid {
    constructor(cellSize) { this.cellSize = positive(cellSize, 256) || 256; this.cells = new Map(); this.membership = new Map(); }
    _key(cx, cy) { return `${cx},${cy}`; }
    _coord(v) { return Math.floor(v / this.cellSize); }
    _keysFor(bounds) {
      const x0 = this._coord(bounds.x), y0 = this._coord(bounds.y), x1 = this._coord(bounds.x + bounds.w), y1 = this._coord(bounds.y + bounds.h);
      const out = [];
      for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) out.push(this._key(x, y));
      return out;
    }
    upsert(id, bounds) {
      this.remove(id);
      const keys = this._keysFor(bounds);
      this.membership.set(id, keys);
      for (const key of keys) { let set = this.cells.get(key); if (!set) { set = new Set(); this.cells.set(key, set); } set.add(id); }
    }
    remove(id) {
      const keys = this.membership.get(id); if (!keys) return;
      for (const key of keys) { const set = this.cells.get(key); if (!set) continue; set.delete(id); if (set.size === 0) this.cells.delete(key); }
      this.membership.delete(id);
    }
    query(bounds) {
      const out = new Set();
      for (const key of this._keysFor(bounds)) { const set = this.cells.get(key); if (set) for (const id of set) out.add(id); }
      return out;
    }
    clear() { this.cells.clear(); this.membership.clear(); }
  }

  class AdaptiveBudget {
    constructor(policy, tier) {
      this.policy = normalizePolicy(policy); this.tierNames = ['low', 'medium', 'high', 'ultra'];
      this.tier = this.policy.tiers[tier] ? tier : 'medium'; this.fps = this.policy.targetFps || 60;
      this.frames = 0; this.windowStart = nowMs(); this.badSince = 0; this.goodSince = 0; this.changed = false;
    }
    get limits() { return this.policy.tiers[this.tier] || this.policy.tiers.medium; }
    _shift(delta) {
      const i = this.tierNames.indexOf(this.tier); const next = this.tierNames[clamp(i + delta, 0, this.tierNames.length - 1)];
      if (next !== this.tier) { this.tier = next; this.changed = true; return true; } return false;
    }
    frame(t) {
      this.frames += 1; const elapsed = t - this.windowStart; const a = this.policy.adaptive || DEFAULT_POLICY.adaptive;
      if (elapsed < positive(a.sampleWindowMs, 1200)) return false;
      this.fps = this.frames * 1000 / Math.max(1, elapsed); this.frames = 0; this.windowStart = t;
      if (this.fps < positive(a.downshiftBelowFps, 52)) { this.goodSince = 0; if (!this.badSince) this.badSince = t; if (t - this.badSince >= positive(a.downshiftHoldMs, 1800)) { this.badSince = t; return this._shift(-1); } }
      else if (this.fps > positive(a.upshiftAboveFps, 58)) { this.badSince = 0; if (!this.goodSince) this.goodSince = t; if (t - this.goodSince >= positive(a.upshiftHoldMs, 8000)) { this.goodSince = t; return this._shift(1); } }
      else { this.badSince = 0; this.goodSince = 0; }
      return false;
    }
  }

  function buildGridMesh(segments) {
    const s = Math.max(2, Math.floor(segments || 8)); const vertices = []; const indices = [];
    for (let y = 0; y <= s; y += 1) for (let x = 0; x <= s; x += 1) { const u = x / s, v = y / s; vertices.push(u - 0.5, v - 0.5, u, v); }
    const row = s + 1;
    for (let y = 0; y < s; y += 1) for (let x = 0; x < s; x += 1) { const a = y * row + x, b = a + 1, c = a + row, d = c + 1; indices.push(a, c, b, b, c, d); }
    return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
  }

  const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 aLocal;
layout(location=1) in vec2 aUV;
layout(location=2) in vec4 iRect;
layout(location=3) in vec4 iAtlas;
layout(location=4) in vec4 iMeta;
layout(location=5) in vec4 iMotionA;
layout(location=6) in vec4 iMotionB;
layout(location=7) in vec4 iMaterial;
uniform vec2 uViewport;
uniform vec2 uCamera;
uniform float uTime;
uniform float uPixelPerfect;
out vec2 vUV;
out vec4 vMaterial;
out float vSeed;
out float vLod;
out float vAtlasLayer;
float sat(float x){ return clamp(x,0.0,1.0); }
void main(){
  float seed=iMeta.x, kind=iMeta.y, phase=iMeta.z, lod=iMeta.w;
  float speed=iMotionA.x, bob=iMotionA.y, sway=iMotionA.z, amp1=iMotionA.w;
  float freq1=iMotionB.x, amp2=iMotionB.y, freq2=iMotionB.z;
  float t=uTime*speed+phase+seed*6.2831853;
  vec2 q=aLocal;
  float u=aUV.x, v=aUV.y;
  float detail=mix(0.18,1.0,1.0-sat(lod));
  q.y += sin(t*1.05)*bob*detail;
  q.x += sin(t*0.73+seed*3.0)*sway*(1.0-v)*detail;
  if(kind < 1.5){
    float side=sign(u-0.5); float wing=smoothstep(0.10,0.46,abs(u-0.5))*(1.0-smoothstep(0.48,0.78,v));
    q.y += sin(t*freq1+side*0.55)*amp1*wing*detail;
    q.x += side*cos(t*freq1*0.72)*amp1*0.28*wing*detail;
    float tail=smoothstep(0.48,0.94,v)*(1.0-smoothstep(0.46,0.5,abs(u-0.5)));
    q.x += sin(t*freq2+v*7.0+seed*2.0)*amp2*tail*detail;
  } else if(kind==2.0 || kind==3.0 || kind==6.0 || kind==12.0 || kind==13.0 || kind==17.0 || kind==18.0){
    float free=(kind==6.0 || kind==12.0) ? smoothstep(0.05,0.95,u) : (1.0-v);
    q.x += sin(t*freq1+v*8.0+u*3.0+seed*4.0)*amp1*free*detail;
    q.y += cos(t*freq1*0.72+u*6.0)*amp1*0.16*free*detail;
  } else if(kind==4.0 || kind==5.0 || kind==14.0){
    float top=1.0-v; q.x += sin(t*freq1+v*2.0+seed*5.0)*amp1*top*top*detail;
  } else if(kind==7.0 || kind==11.0){
    float chest=1.0-length(vec2((u-0.5)*1.5,(v-0.55)*1.8)); q.x *= 1.0+sin(t*freq1)*amp1*0.35*sat(chest)*detail;
  } else if(kind==8.0 || kind==15.0 || kind==16.0){
    q += vec2(sin(t*freq1+seed*4.0),cos(t*freq1*1.17+seed*5.0))*amp1*0.28*detail;
  } else if(kind==9.0 || kind==10.0){
    q.y += sin(t*freq1+u*4.0+seed*2.0)*amp1*0.12*detail;
  }
  vec2 size=iRect.zw; vec2 origin=iRect.xy;
  if(uPixelPerfect > 0.5) origin=floor(origin+0.5);
  vec2 worldPos=origin+q*size; vec2 px=worldPos-uCamera; vec2 ndc=vec2(px.x/uViewport.x*2.0-1.0,1.0-px.y/uViewport.y*2.0);
  gl_Position=vec4(ndc,0.0,1.0);
  vUV=iAtlas.xy+aUV*iAtlas.zw; vMaterial=iMaterial; vSeed=seed; vLod=lod; vAtlasLayer=iMotionB.w;
}`;

  const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform highp sampler2DArray uAtlas;
uniform float uTime;
in vec2 vUV;
in vec4 vMaterial;
in float vSeed;
in float vLod;
in float vAtlasLayer;
out vec4 outColor;
float hash21(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y); }
void main(){
  vec4 c=texture(uAtlas,vec3(vUV,floor(vAtlasLayer+0.5))); if(c.a < 0.004) discard;
  float detail=mix(0.22,1.0,1.0-clamp(vLod,0.0,1.0));
  float shimmer=vMaterial.x*detail; float glow=vMaterial.y*detail; float sparkle=vMaterial.z*detail; float opacity=vMaterial.w;
  float sweep=0.5+0.5*sin(uTime*1.7+vUV.x*23.0-vUV.y*17.0+vSeed*11.0);
  float pixelNoise=hash21(floor(vUV*512.0)+vSeed*97.0);
  float flash=step(0.985, fract(pixelNoise+uTime*0.13+vSeed))*sparkle;
  c.rgb += c.rgb*shimmer*sweep*0.22 + vec3(glow*0.06) + vec3(flash*0.45);
  c.a *= opacity; outColor=c;
}`;

  function compile(gl, type, source) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const msg = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`PixelAnimation shader compile failed: ${msg}`); }
    return shader;
  }
  function link(gl, vsSource, fsSource) {
    const p = gl.createProgram(), vs = compile(gl, gl.VERTEX_SHADER, vsSource), fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const msg = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(`PixelAnimation program link failed: ${msg}`); }
    return p;
  }

  class WebGL2Renderer {
    constructor(canvas, options) {
      this.canvas = canvas; this.options = options || {}; this.policy = normalizePolicy(this.options.policy); this.profiles = { ...DEFAULT_PROFILES, ...(this.options.profiles || {}) };
      this.gl = canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance', desynchronized: true });
      if (!this.gl) throw new Error('WebGL2 unavailable');
      this.program = link(this.gl, VERTEX_SHADER, FRAGMENT_SHADER); this.mesh = buildGridMesh(this.options.gridSegments || 8); this._initBuffers();
      this.texture = null; this.atlasWidth = 1; this.atlasHeight = 1; this.instanceStride = 24; this.capacity = 256; this.instanceData = new Float32Array(this.capacity * this.instanceStride);
      this.objects = new Map(); this.nextId = 1; this.grid = new SpatialHashGrid(this.options.cellSize || 256); this.camera = { x: 0, y: 0, w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 };
      const glInfo = { webgl2: true, mobile: /Android|iPhone|iPad|iPod/i.test((root.navigator && root.navigator.userAgent) || ''), deviceMemory: root.navigator && root.navigator.deviceMemory, hardwareConcurrency: root.navigator && root.navigator.hardwareConcurrency, maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) };
      this.budget = new AdaptiveBudget(this.policy, this.options.tier || chooseDeviceTier(glInfo, this.policy)); this.visible = []; this.visibilityDirty = true; this.lastVisibilityAt = 0; this.startAt = nowMs(); this.running = false; this.raf = 0; this.lastStats = { backend: 'webgl2', visible: 0, total: 0, fps: 60, tier: this.budget.tier, drawCalls: 0 };
      this._onVisibility = () => { if (!this.policy.pauseWhenHidden) return; if (root.document && root.document.hidden) this.stop(); else this.start(); };
      if (root.document && root.document.addEventListener) root.document.addEventListener('visibilitychange', this._onVisibility, { passive: true });
      this.resize();
    }
    _initBuffers() {
      const gl = this.gl; this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
      this.vertexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.mesh.vertices, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      this.indexBuffer = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.mesh.indices, gl.STATIC_DRAW);
      this.instanceBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer); gl.bufferData(gl.ARRAY_BUFFER, 256 * 24 * 4, gl.DYNAMIC_DRAW);
      const stride = 24 * 4; for (let i = 0; i < 6; i += 1) { const loc = 2 + i; gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16); gl.vertexAttribDivisor(loc, 1); }
      gl.bindVertexArray(null);
      this.uViewport = gl.getUniformLocation(this.program, 'uViewport'); this.uCamera = gl.getUniformLocation(this.program, 'uCamera'); this.uTime = gl.getUniformLocation(this.program, 'uTime'); this.uPixelPerfect = gl.getUniformLocation(this.program, 'uPixelPerfect'); this.uAtlas = gl.getUniformLocation(this.program, 'uAtlas');
    }
    resize(width, height) {
      const limits = this.budget ? this.budget.limits : this.policy.tiers.medium; const dpr = clamp((root.devicePixelRatio || 1), 1, positive(limits.maxDpr, 1.5)); const scale = positive(limits.resolutionScale, 1);
      const cssW = Math.max(1, Math.floor(width || this.canvas.clientWidth || this.canvas.width || 1)); const cssH = Math.max(1, Math.floor(height || this.canvas.clientHeight || this.canvas.height || 1));
      const w = Math.max(1, Math.floor(cssW * dpr * scale)); const h = Math.max(1, Math.floor(cssH * dpr * scale)); if (this.canvas.width !== w) this.canvas.width = w; if (this.canvas.height !== h) this.canvas.height = h;
      this.camera.w = cssW; this.camera.h = cssH; this.pixelRatio = w / cssW; this.gl.viewport(0, 0, w, h); this.visibilityDirty = true;
    }
    setCamera(camera) { if (!camera) return; this.camera.x = Number(camera.x) || 0; this.camera.y = Number(camera.y) || 0; if (camera.w) this.camera.w = camera.w; if (camera.h) this.camera.h = camera.h; this.visibilityDirty = true; }
    setProfiles(profiles) { this.profiles = { ...this.profiles, ...(profiles || {}) }; for (const o of this.objects.values()) o.params = profileParams(this.profiles[o.profile] || { kind: o.profile }); this.visibilityDirty = true; }
    setPolicy(policy) { this.policy = normalizePolicy(policy); this.budget.policy = this.policy; this.resize(); }
    async _loadImage(source) { let image = source; if (typeof source === 'string') { const res = await fetch(source, { mode:'cors', credentials:'omit', cache:'force-cache' }); if (!res.ok) throw new Error(`Atlas load failed: ${res.status}`); const blob=await res.blob(); image = root.createImageBitmap ? await root.createImageBitmap(blob,{premultiplyAlpha:'premultiply'}) : await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=URL.createObjectURL(blob);}); } return image; }
    async initAtlasArray(spec) { const gl=this.gl,x=spec||{},width=Math.max(1,Number(x.width)||1),height=Math.max(1,Number(x.height)||1),layers=Math.max(1,Number(x.layers)||1); if(this.texture)gl.deleteTexture(this.texture); this.texture=gl.createTexture(); this.atlasWidth=width; this.atlasHeight=height; this.atlasLayers=layers; gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.texStorage3D(gl.TEXTURE_2D_ARRAY,1,gl.RGBA8,width,height,layers); gl.bindTexture(gl.TEXTURE_2D_ARRAY,null); return this; }
    async loadAtlasLayer(layer,source) { const gl=this.gl,image=await this._loadImage(source),z=Math.max(0,Number(layer)||0); if(!this.texture||z>=this.atlasLayers||image.width>this.atlasWidth||image.height>this.atlasHeight)throw new Error('Atlas layer incompatible with allocated texture array'); gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true); gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,0,0,0,z,image.width,image.height,1,gl.RGBA,gl.UNSIGNED_BYTE,image); gl.bindTexture(gl.TEXTURE_2D_ARRAY,null); return this; }
    async loadAtlas(source) { const image=await this._loadImage(source); await this.initAtlasArray({width:image.width||1,height:image.height||1,layers:1}); await this.loadAtlasLayer(0,image); return this; }
    async loadAtlases(sources) { const list=Array.from(sources||[]); if(!list.length)throw new Error('loadAtlases requires at least one source'); const images=[]; for(const src of list)images.push(await this._loadImage(src)); const width=Math.max(...images.map(i=>i.width||1)),height=Math.max(...images.map(i=>i.height||1)); await this.initAtlasArray({width,height,layers:images.length}); for(let i=0;i<images.length;i++)await this.loadAtlasLayer(i,images[i]); return this; }
    spawn(spec) {
      const s = spec || {}; const id = s.id != null ? s.id : this.nextId++; if (this.objects.has(id)) throw new Error(`Duplicate pixel animation id: ${id}`);
      const profile = s.profile || 'generic'; const obj = { id, x: Number(s.x) || 0, y: Number(s.y) || 0, w: Math.max(1, Number(s.w || s.width) || 64), h: Math.max(1, Number(s.h || s.height) || 64), uv: s.uv || [0, 0, 1, 1], profile, params: profileParams(this.profiles[profile] || { kind: profile }), seed: s.seed == null ? hashSeed(id) : Number(s.seed), phase: Number(s.phase) || 0, opacity: s.opacity == null ? 1 : clamp(Number(s.opacity), 0, 1), priority: Number(s.priority) || 0, lodBias: Number(s.lodBias) || 0, atlasLayer: Math.max(0, Number(s.atlasLayer) || 0) };
      this.objects.set(id, obj); this.grid.upsert(id, { x: obj.x - obj.w / 2, y: obj.y - obj.h / 2, w: obj.w, h: obj.h }); this.visibilityDirty = true; return id;
    }
    update(id, patch) {
      const o = this.objects.get(id); if (!o) return false; const p = patch || {}; let moved = false;
      for (const key of ['x', 'y', 'w', 'h', 'phase', 'priority', 'lodBias']) if (p[key] != null) { o[key] = Number(p[key]); if (key === 'x' || key === 'y' || key === 'w' || key === 'h') moved = true; }
      if (p.width != null) { o.w = Number(p.width); moved = true; } if (p.height != null) { o.h = Number(p.height); moved = true; }
      if (p.uv) o.uv = p.uv; if (p.atlasLayer != null) o.atlasLayer = Math.max(0, Number(p.atlasLayer)||0); if (p.opacity != null) o.opacity = clamp(Number(p.opacity), 0, 1); if (p.seed != null) o.seed = Number(p.seed); if (p.profile) { o.profile = p.profile; o.params = profileParams(this.profiles[o.profile] || { kind: o.profile }); }
      if (moved) this.grid.upsert(id, { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h }); this.visibilityDirty = true; return true;
    }
    remove(id) { if (!this.objects.delete(id)) return false; this.grid.remove(id); this.visibilityDirty = true; return true; }
    clear() { this.objects.clear(); this.grid.clear(); this.visible.length = 0; this.visibilityDirty = true; }
    _refreshVisible(t) {
      const limits = this.budget.limits; const hz = Math.max(1, positive(limits.farUpdateHz, 12)); if (!this.visibilityDirty && t - this.lastVisibilityAt < 1000 / hz) return;
      this.lastVisibilityAt = t; this.visibilityDirty = false; const margin = Math.max(this.camera.w, this.camera.h) * 0.12; const bounds = { x: this.camera.x - margin, y: this.camera.y - margin, w: this.camera.w + margin * 2, h: this.camera.h + margin * 2 };
      const cx = this.camera.x + this.camera.w / 2, cy = this.camera.y + this.camera.h / 2; const candidates = [];
      for (const id of this.grid.query(bounds)) { const o = this.objects.get(id); if (!o) continue; const dx = o.x - cx, dy = o.y - cy; candidates.push({ o, score: dx * dx + dy * dy - o.priority * 1e8 }); }
      candidates.sort((a, b) => a.score - b.score); const max = Math.min(candidates.length, limits.maxVisible || candidates.length); this.visible.length = max;
      const full = limits.fullAnimation || max, medium = limits.mediumAnimation || max; for (let i = 0; i < max; i += 1) { const entry = candidates[i]; entry.lod = clamp((i < full ? 0 : (i < medium ? 0.55 : 1)) + entry.o.lodBias, 0, 1); this.visible[i] = entry; }
    }
    _ensureCapacity(count) { if (count <= this.capacity) return; while (this.capacity < count) this.capacity *= 2; this.instanceData = new Float32Array(this.capacity * this.instanceStride); const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer); gl.bufferData(gl.ARRAY_BUFFER, this.capacity * this.instanceStride * 4, gl.DYNAMIC_DRAW); }
    _pack(entry, index) {
      const o = entry.o, p = o.params, d = this.instanceData, k = index * this.instanceStride; const uv = o.uv; const uvx = uv[0], uvy = uv[1], uvw = uv[2], uvh = uv[3];
      d[k] = o.x; d[k+1] = o.y; d[k+2] = o.w; d[k+3] = o.h; d[k+4] = uvx; d[k+5] = uvy; d[k+6] = uvw; d[k+7] = uvh;
      d[k+8] = o.seed; d[k+9] = p.kindId; d[k+10] = o.phase; d[k+11] = entry.lod;
      d[k+12] = p.speed; d[k+13] = p.bob; d[k+14] = p.sway; d[k+15] = p.amp1;
      d[k+16] = p.freq1; d[k+17] = p.amp2; d[k+18] = p.freq2; d[k+19] = o.atlasLayer || 0;
      d[k+20] = p.shimmer; d[k+21] = p.glow; d[k+22] = p.sparkle; d[k+23] = o.opacity;
    }
    render(tInput) {
      if (!this.texture) return; const t = Number.isFinite(tInput) ? tInput : nowMs(); if (this.budget.frame(t)) { this.resize(); this.visibilityDirty = true; }
      this._refreshVisible(t); const count = this.visible.length; this._ensureCapacity(count); for (let i = 0; i < count; i += 1) this._pack(this.visible[i], i);
      const gl = this.gl; gl.useProgram(this.program); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, count * this.instanceStride)); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texture); gl.uniform1i(this.uAtlas, 0); gl.uniform2f(this.uViewport, this.camera.w, this.camera.h); gl.uniform2f(this.uCamera, this.camera.x, this.camera.y); gl.uniform1f(this.uTime, (t - this.startAt) / 1000); gl.uniform1f(this.uPixelPerfect, this.policy.pixelPerfect ? 1 : 0); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); if (count) gl.drawElementsInstanced(gl.TRIANGLES, this.mesh.indices.length, gl.UNSIGNED_SHORT, 0, count); gl.bindVertexArray(null);
      this.lastStats = { backend: 'webgl2', visible: count, total: this.objects.size, fps: this.budget.fps, tier: this.budget.tier, drawCalls: count ? 1 : 0, resolutionScale: this.budget.limits.resolutionScale };
    }
    start() { if (this.running) return; this.running = true; const raf = root.requestAnimationFrame || ((fn) => setTimeout(() => fn(nowMs()), 16)); const loop = (t) => { if (!this.running) return; this.render(t); this.raf = raf(loop); }; this.raf = raf(loop); }
    stop() { this.running = false; const cancel = root.cancelAnimationFrame || clearTimeout; if (this.raf) cancel(this.raf); this.raf = 0; }
    stats() { return { ...this.lastStats }; }
    destroy() { this.stop(); if (root.document && root.document.removeEventListener) root.document.removeEventListener('visibilitychange', this._onVisibility); this.clear(); const gl = this.gl; if (this.texture) gl.deleteTexture(this.texture); gl.deleteBuffer(this.vertexBuffer); gl.deleteBuffer(this.indexBuffer); gl.deleteBuffer(this.instanceBuffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program); }
  }

  class Canvas2DRenderer {
    constructor(canvas, options) { this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true }); if (!this.ctx) throw new Error('Canvas2D unavailable'); this.options = options || {}; this.policy = normalizePolicy(this.options.policy); this.profiles = { ...DEFAULT_PROFILES, ...(this.options.profiles || {}) }; this.objects = new Map(); this.nextId = 1; this.image = null; this.camera = { x: 0, y: 0, w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 }; this.startAt = nowMs(); this.running = false; this.raf = 0; this.lastStats = { backend: 'canvas2d', visible: 0, total: 0, fps: 0, tier: 'low', drawCalls: 0 }; this.resize(); }
    resize(width, height) { const w = Math.max(1, Math.floor(width || this.canvas.clientWidth || this.canvas.width || 1)), h = Math.max(1, Math.floor(height || this.canvas.clientHeight || this.canvas.height || 1)); this.canvas.width = w; this.canvas.height = h; this.camera.w = w; this.camera.h = h; this.ctx.imageSmoothingEnabled = false; }
    setCamera(c) { if (!c) return; Object.assign(this.camera, c); }
    setProfiles(p) { this.profiles = { ...this.profiles, ...(p || {}) }; }
    setPolicy(p) { this.policy = normalizePolicy(p); }
    async loadAtlas(source) { if (typeof source !== 'string') { this.image = source; return this; } this.image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source; }); return this; }
    spawn(spec) { const s = spec || {}, id = s.id != null ? s.id : this.nextId++; this.objects.set(id, { id, x: Number(s.x)||0, y:Number(s.y)||0, w:Number(s.w||s.width)||64, h:Number(s.h||s.height)||64, uv:s.uv||[0,0,1,1], profile:s.profile||'generic', seed:s.seed==null?hashSeed(id):Number(s.seed), phase:Number(s.phase)||0, opacity:s.opacity==null?1:Number(s.opacity) }); return id; }
    update(id, patch) { const o = this.objects.get(id); if (!o) return false; Object.assign(o, patch || {}); return true; }
    remove(id) { return this.objects.delete(id); } clear(){ this.objects.clear(); }
    render(tInput) { if (!this.image) return; const t = Number.isFinite(tInput) ? tInput : nowMs(), sec=(t-this.startAt)/1000, ctx=this.ctx, c=this.camera; ctx.clearRect(0,0,this.canvas.width,this.canvas.height); ctx.imageSmoothingEnabled=false; let visible=0; const max=this.policy.tiers.low.maxVisible;
      for (const o of this.objects.values()) { if (visible>=max) break; if (o.x+o.w/2<c.x||o.x-o.w/2>c.x+c.w||o.y+o.h/2<c.y||o.y-o.h/2>c.y+c.h) continue; const p=profileParams(this.profiles[o.profile]||{kind:o.profile}), bob=Math.sin(sec*p.speed+o.phase+o.seed*6.28)*p.bob*o.h, sway=Math.sin(sec*p.speed*0.73+o.seed*4)*p.sway*o.h; const uv=o.uv, sx=uv[0]*this.image.width, sy=uv[1]*this.image.height, sw=uv[2]*this.image.width, sh=uv[3]*this.image.height; ctx.globalAlpha=o.opacity; ctx.drawImage(this.image,sx,sy,sw,sh,Math.round(o.x-o.w/2-c.x+sway),Math.round(o.y-o.h/2-c.y+bob),Math.round(o.w),Math.round(o.h)); visible+=1; }
      ctx.globalAlpha=1; this.lastStats={backend:'canvas2d',visible,total:this.objects.size,fps:0,tier:'low',drawCalls:visible}; }
    start(){ if(this.running)return; this.running=true; const raf=root.requestAnimationFrame||((fn)=>setTimeout(()=>fn(nowMs()),16)); const loop=(t)=>{if(!this.running)return;this.render(t);this.raf=raf(loop);};this.raf=raf(loop);} stop(){this.running=false;const cancel=root.cancelAnimationFrame||clearTimeout;if(this.raf)cancel(this.raf);this.raf=0;} stats(){return{...this.lastStats};} destroy(){this.stop();this.clear();}
  }

  async function fetchConfig(url, options) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), (options && options.timeoutMs) || 4000);
    try { const res = await fetch(url, { signal: controller.signal, cache: 'force-cache', credentials: 'omit' }); if (!res.ok) throw new Error(`Config load failed: ${res.status}`); const data = await res.json(); const learned = data.learnedPolicy || null; const policy = learned ? normalizePolicy(merge(data.policy || {}, learned)) : normalizePolicy(data.policy); return { policy, profiles: { ...DEFAULT_PROFILES, ...(data.profiles || {}) }, atlases: data.atlases || {}, learnedPolicy: learned, version: data.version || 1 }; }
    finally { clearTimeout(timeout); }
  }

  function create(canvas, options) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PixelAnimation.create requires a canvas');
    const opts = options || {}; try { return new WebGL2Renderer(canvas, opts); } catch (error) { if (opts.webgl2Required) throw error; return new Canvas2DRenderer(canvas, opts); }
  }

  return Object.freeze({ VERSION, PROFILE_IDS, DEFAULT_POLICY, DEFAULT_PROFILES, hashSeed, merge, normalizePolicy, normalizeProfile, chooseDeviceTier, profileParams, SpatialHashGrid, AdaptiveBudget, buildGridMesh, WebGL2Renderer, Canvas2DRenderer, fetchConfig, create });
});
