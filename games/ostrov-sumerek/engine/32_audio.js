/* -----------------------------------------------------------------------------
   12 · Sound: procedural WebAudio (sea, wind, night drone, chimes)
----------------------------------------------------------------------------- */
const SFX = {
  ctx: null, out: null, muted: false, beds: null, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC(); this.ctx = ctx;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3.5;
      this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 0.85;
      this.out.connect(comp); comp.connect(ctx.destination);
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      const bed = (rate, type, freq, q, gain, lfoHz, lfoAmt) => {
        const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain(); g.gain.value = gain;
        const l = ctx.createOscillator(); l.frequency.value = lfoHz; const lg = ctx.createGain(); lg.gain.value = lfoAmt;
        l.connect(lg); lg.connect(g.gain);
        s.connect(f); f.connect(g); g.connect(this.out); s.start(); l.start();
        return g;
      };
      const waves = bed(1, 'lowpass', 520, 0.4, 0.12, 0.09, 0.08);
      const wind = bed(0.6, 'bandpass', 700, 0.7, 0.025, 0.05, 0.02);
      const droneG = ctx.createGain(); droneG.gain.value = 0;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 420;
      [55, 82.41, 110].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = i === 1 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 6;
        const og = ctx.createGain(); og.gain.value = i === 1 ? 0.25 : 0.5; o.connect(og); og.connect(dl); o.start();
      });
      dl.connect(droneG); droneG.connect(this.out);
      const rain = bed(1.15, 'highpass', 2400, 0.4, 0, 0.21, 0);      // silent until weather asks for it
      const gust = bed(0.4, 'bandpass', 380, 1.4, 0, 0.13, 0);        // low storm wind
      this.beds = { waves, wind, droneG, rain, gust };
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  },
  // amb: biome.ambience blended with the current event's (see ambienceMix in 86_events.js)
  ambience(night, danger, amb) {
    if (!this.beds) return;
    const t = this.ctx.currentTime, a = amb || {};
    this.beds.droneG.gain.setTargetAtTime((0.015 + night * 0.05 + danger * 0.05) * (a.drone ?? 1), t, 0.8);
    this.beds.wind.gain.setTargetAtTime((0.02 + night * 0.03) * (a.wind ?? 1), t, 1.2);
    this.beds.waves.gain.setTargetAtTime(0.12 * (a.waves ?? 1), t, 1.5);
    this.beds.rain.gain.setTargetAtTime(0.07 * (a.rain ?? 0), t, 1.4);
    this.beds.gust.gain.setTargetAtTime(0.09 * (a.gust ?? 0), t, 1.8);
  },
  tone(freq, dur, type = 'square', vol = 0.08, slide = 0, delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // filtered noise whose centre frequency slides: whooshes, zips, swooshes
  sweep(dur, f0, f1, q = 1.2, vol = 0.06, type = 'bandpass', delay = 0) {
    const c = this.ctx; if (!c || this.muted || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  hiss(dur, freq, q = 1, vol = 0.08, type = 'bandpass', delay = 0) {
    const c = this.ctx; if (!c || this.muted || !this.noiseBuf) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  coin(k) { const m = Math.pow(2, Math.min(k, 7) / 12); this.tone(988 * m, 0.08, 'square', 0.05); this.tone(1319 * m, 0.24, 'square', 0.045, 0, 0.07); this.tone(2637 * m, 0.4, 'sine', 0.025, 0, 0.07); },
  jump() { this.tone(240, 0.14, 'square', 0.025, 480); },
  land(v) { this.hiss(0.09, 260, 0.8, Math.min(0.12, 0.03 + v * 0.006), 'lowpass'); },
  step(s) { if (REG.sounds.has('step_' + s)) { playSound('step_' + s, { jitter: 0.25 }); return; } this.hiss(0.04, s === 'wood' ? 1900 : s === 'water' ? 800 : s === 'stone' ? 2400 : 1300, 1.4, s === 'water' ? 0.05 : 0.028); },
  splash() { this.hiss(0.6, 1100, 0.5, 0.16); this.hiss(0.3, 380, 0.8, 0.12, 'lowpass', 0.04); },
  hurt() { this.tone(330, 0.34, 'sawtooth', 0.07, 70); this.hiss(0.25, 650, 0.7, 0.1); },
  heal() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.05, 0, i * 0.07)); },
  beat(s) { this.tone(64, 0.13, 'sine', 0.2 * s, 42); this.tone(58, 0.13, 'sine', 0.14 * s, 40, 0.18); },
  rise() { this.hiss(1.4, 240, 3, 0.05); this.tone(98, 1.2, 'sine', 0.04, 49); },
  ignite() { this.hiss(1.6, 500, 0.4, 0.14, 'lowpass'); [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 2.2, 'triangle', 0.045, 0, 0.15 + i * 0.11)); this.tone(1047, 2.6, 'sine', 0.03, 0, 0.8); },
  die() { this.tone(220, 1.4, 'sawtooth', 0.07, 40); this.hiss(1.2, 300, 0.6, 0.1, 'lowpass'); },
  ui() { this.tone(660, 0.07, 'square', 0.03); },
  // ── combat ──
  swing(h = 1) { const k = 0.6 + h * 0.5; this.sweep(0.09 + 0.07 * h, 2600 / k, 480 / k, 1.3, 0.04 + 0.022 * h); },
  hit(p = 1, crit = false) {
    const j = 1 + (Math.random() - 0.5) * 0.2;
    this.tone(150 * j - p * 18, 0.12 + p * 0.03, 'square', 0.05 + p * 0.025, 45);
    this.hiss(0.07, 1900 * j, 0.9, 0.07 + p * 0.03);
    if (crit) { this.tone(1500, 0.14, 'square', 0.035, 2600); this.hiss(0.1, 4200, 2, 0.05); }
  },
  shot(id, k = 1) {
    const j = 1 + (Math.random() - 0.5) * 0.12;
    switch (id) {
      case 'sling': this.sweep(0.13, 900, 2800, 2, 0.06); this.tone(330 * j, 0.1, 'triangle', 0.04, 170); break;
      case 'bow': this.tone((150 + 140 * k) * j, 0.24, 'triangle', 0.07, 85); this.sweep(0.2, 2800, 650, 1.6, 0.025 + 0.045 * k); break;
      case 'xbow': this.tone(115 * j, 0.11, 'square', 0.06, 60); this.sweep(0.1, 3200, 1200, 2, 0.06); this.tone(1900, 0.3, 'sine', 0.025, 2700, 0.02); break;
      case 'pistol': this.hiss(0.2, 1500 * j, 0.5, 0.2); this.tone(190 * j, 0.12, 'square', 0.08, 50); break;
      case 'shotgun': this.hiss(0.45, 650, 0.4, 0.3, 'lowpass'); this.tone(88, 0.28, 'sawtooth', 0.12, 34); this.hiss(0.12, 2600, 0.6, 0.12);
        this.tone(900, 0.04, 'square', 0.03, 0, 0.3); this.tone(620, 0.05, 'square', 0.03, 0, 0.38); break;   // pump
      case 'smg': this.hiss(0.06, 2100 * j, 0.8, 0.09); this.tone(230 * j, 0.05, 'square', 0.035, 90); break;
      case 'saw': this.tone(520 * j, 0.25, 'sawtooth', 0.035, 1500); this.sweep(0.22, 1200, 4200, 4, 0.05); break;
      case 'bomb': this.tone(125 * j, 0.22, 'sine', 0.17, 48); this.hiss(0.28, 420, 0.5, 0.15, 'lowpass'); break;
      case 'tesla': this.tone(1300 * j, 0.18, 'sawtooth', 0.045, 180); this.hiss(0.22, 3600, 2, 0.09); this.tone(62, 0.22, 'square', 0.04); break;
      default: this.hiss(0.1, 1600, 0.6, 0.1);
    }
  },
  explode() { this.hiss(1.2, 360, 0.4, 0.34, 'lowpass'); this.tone(68, 0.7, 'sine', 0.24, 28); this.hiss(0.3, 2100, 0.5, 0.12); },
  ricochet(saw) { const f = saw ? 2300 : 2700 + Math.random() * 1600; this.tone(f, 0.24, 'sine', 0.035, f * 0.45); if (saw) this.hiss(0.08, 5000, 2, 0.05); },
  thunk() { this.tone(150, 0.08, 'square', 0.05, 70); this.hiss(0.05, 900, 1, 0.05); },
  tick() { this.tone(1700 + Math.random() * 700, 0.03, 'square', 0.022); },
  tock() { this.tone(250 + Math.random() * 70, 0.08, 'triangle', 0.07, 150); },
  reload() { this.tone(880, 0.04, 'square', 0.03); this.tone(660, 0.05, 'square', 0.03, 0, 0.13); },
  reloadEnd() { this.tone(520, 0.05, 'square', 0.04); this.tone(1040, 0.06, 'square', 0.035, 0, 0.06); },
  empty() { this.tone(2300, 0.025, 'square', 0.03); },
  equip() { this.sweep(0.12, 1300, 3400, 3, 0.03); this.tone(880, 0.05, 'triangle', 0.03, 0, 0.05); },
  loot() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'square', 0.032, 0, i * 0.05)); this.tone(2093, 0.5, 'sine', 0.025, 0, 0.26); },
  draw() { this.tone(85, 0.7, 'sawtooth', 0.018, 160); },
  dash() { this.sweep(0.26, 600, 3800, 1.5, 0.08); },
  slam() { this.tone(52, 0.55, 'sine', 0.32, 28); this.hiss(0.55, 280, 0.5, 0.26, 'lowpass'); this.hiss(0.15, 1500, 0.6, 0.1); },
  timber() { this.hiss(0.1, 2700, 1, 0.13); this.tone(105, 0.9, 'sawtooth', 0.035, 55, 0.05); this.hiss(0.7, 480, 0.5, 0.16, 'lowpass', 0.45); },
  foeDie(big) { this.sweep(big ? 1.6 : 0.5, 1900, 180, 2, big ? 0.15 : 0.07); this.tone(big ? 78 : 290, big ? 1.6 : 0.4, 'sawtooth', 0.05, big ? 28 : 80); },
  roar() { this.tone(58, 1.7, 'sawtooth', 0.12, 36); this.tone(87, 1.5, 'sawtooth', 0.08, 44, 0.06); this.hiss(1.6, 280, 0.7, 0.2, 'lowpass'); },
  orb() { this.tone(380, 0.42, 'sine', 0.05, 920); this.tone(190, 0.42, 'triangle', 0.03, 460); },
  soul() { this.tone(1047, 0.15, 'sine', 0.04); this.tone(1568, 0.26, 'sine', 0.035, 0, 0.06); },
  overheat() { this.hiss(0.9, 3300, 0.6, 0.11); this.tone(1400, 0.45, 'square', 0.03, 380); },
  parry() { this.tone(1900, 0.18, 'triangle', 0.05, 2700); this.tone(2850, 0.26, 'sine', 0.03, 0, 0.03); },
  windup() { this.tone(70, 1.0, 'sawtooth', 0.07, 210); this.sweep(1.0, 300, 2400, 3, 0.07); },
  // the prism hums while it fires: detuned saws through a wobbling band-pass, faded in and out
  beamG: null,
  beam(on) {
    const c = this.ctx; if (!c) return;
    if (!this.beamG) {
      const g = c.createGain(); g.gain.value = 0;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.2;
      [221, 224.5, 110.6].forEach((fr, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'square' : 'sawtooth'; o.frequency.value = fr; const og = c.createGain(); og.gain.value = i === 2 ? 0.35 : 0.5; o.connect(og); og.connect(f); o.start(); });
      const l = c.createOscillator(); l.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 260; l.connect(lg); lg.connect(f.frequency); l.start();
      f.connect(g); g.connect(this.out);
      this.beamG = g;
    }
    this.beamG.gain.setTargetAtTime(on && !this.muted ? 0.07 : 0, c.currentTime, on ? 0.04 : 0.08);
  },
};
// sounds as data (defineSound or inline arrays in content):
//   ['tone', freq, dur, type, vol, slide, delay]     an oscillator with an exponential pitch slide
//   ['hiss', dur, freq, q, vol, type, delay]         filtered noise burst
//   ['sweep', dur, f0, f1, q, vol, type, delay]      filtered noise whose centre frequency slides
// steps may also be a function (k) => steps, k = charge / intensity 0..1
function playSound(src, opts = {}) {
  if (!SFX.ctx || SFX.muted) return;
  let steps = typeof src === 'string' ? (REG.sounds.get(src) || {}).steps : src;
  if (typeof steps === 'function') steps = steps(opts.k ?? 1);
  if (!steps) return;
  const p = (opts.pitch ?? 1) * (1 + (Math.random() - 0.5) * (opts.jitter ?? 0.12)), v = opts.vol ?? 1;
  for (const st of steps) {
    const [kind, a0, a1, a2, a3, a4, a5, a6] = st;
    if (kind === 'tone') SFX.tone(a0 * p, a1, a2 || 'square', (a3 ?? 0.08) * v, a4 ? a4 * p : 0, a5 || 0);
    else if (kind === 'hiss') SFX.hiss(a0, a1 * p, a2 ?? 1, (a3 ?? 0.08) * v, a4 || 'bandpass', a5 || 0);
    else if (kind === 'sweep') SFX.sweep(a0, a1 * p, a2 * p, a3 ?? 1.2, (a4 ?? 0.06) * v, a5 || 'bandpass', a6 || 0);
  }
}
