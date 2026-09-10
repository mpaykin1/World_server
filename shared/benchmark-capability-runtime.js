(function () {
  'use strict';

  if (window.WorldCapabilities?.version) return;

  const pathname = location.pathname.toLowerCase();
  const forcedWorldId = (document.documentElement.dataset.capabilityWorld || new URLSearchParams(location.search).get('world') || '').toLowerCase();
  const profiles = [
    { match: '/apps/voxel-world/', id: 'voxel-world', fog: 0.08, precip: 'rain', motes: 'voxel', wind: 0.34, events: ['gust', 'rain', 'lightning', 'impact'] },
    { match: '/apps/ai3d-voxel-city/', id: 'ai3d-voxel-city', fog: 0.11, precip: 'dust', motes: 'debris', wind: 0.48, events: ['gust', 'tornado', 'impact', 'rain'] },
    { match: '/apps/survival/', id: 'survival', fog: 0.16, precip: 'rain', motes: 'ember', wind: 0.42, events: ['rain', 'gust', 'lightning', 'wave'] },
    { match: '/apps/world-sharabass/', id: 'world-sharabass', fog: 0.06, precip: 'music', motes: 'note', wind: 0.18, events: ['music', 'rain', 'gust', 'lens'] },
    { match: '/apps/dark-void-scene/', id: 'dark-void-scene', fog: 0.03, precip: 'stars', motes: 'star', wind: 0.04, space: true, events: ['lens', 'orbit', 'pulse'] },
    { match: '/apps/benchmark-convergence-world/', id: 'benchmark-convergence-world', fog: 0.07, precip: 'motes', motes: 'spark', wind: 0.30, space: true, events: ['tornado', 'wave', 'impact', 'lens', 'orbit', 'rain', 'gust', 'lightning'] }
  ];

  const gatewayProfiles = {
    'dark-void-navigator-live': { id:'dark-void-navigator-live', fog:.03, precip:'stars', motes:'star', wind:.04, space:true, events:['lens','orbit','pulse'], signature:'lens' },
    'improve-world-home-live': { id:'improve-world-home-live', fog:.06, precip:'motes', motes:'spark', wind:.22, events:['gust','rain','pulse'], signature:'rain' },
    'improve-world-experiment-100': { id:'improve-world-experiment-100', fog:.08, precip:'motes', motes:'spark', wind:.30, events:['lightning','wave','impact'], signature:'lightning' },
    'voxel-gothic-steampunk-world': { id:'voxel-gothic-steampunk-world', fog:.13, precip:'dust', motes:'ember', wind:.44, events:['gust','rain','lightning'], signature:'gust' },
    'gothic-voxel-city-atlas-v3-mobile-final': { id:'gothic-voxel-city-atlas-v3-mobile-final', fog:.12, precip:'rain', motes:'debris', wind:.34, events:['rain','gust','impact'], signature:'rain' },
    'voxel-gothic-steampunk-mobile-repaired': { id:'voxel-gothic-steampunk-mobile-repaired', fog:.10, precip:'dust', motes:'ember', wind:.40, events:['gust','rain','impact'], signature:'gust' },
    'world-server-codex-voxel-v3': { id:'world-server-codex-voxel-v3', fog:.08, precip:'rain', motes:'voxel', wind:.30, events:['rain','gust','impact'], signature:'rain' },
    'world-server-catalog-live': { id:'world-server-catalog-live', fog:.05, precip:'motes', motes:'spark', wind:.18, events:['orbit','pulse','gust'], signature:'orbit' }
  };
  let profile = profiles.find(item => pathname.includes(item.match)) || gatewayProfiles[forcedWorldId];
  if (!profile && forcedWorldId) profile = { id:forcedWorldId, fog:.07, precip:'motes', motes:'spark', wind:.24, events:['rain','gust','pulse'], signature:'rain' };
  if (!profile) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const tier = reducedMotion ? 0 : (lowMemory || lowCpu || coarse ? 1 : 2);
  let budget = tier === 2 ? 150 : tier === 1 ? 84 : 24;

  const canvas = document.createElement('canvas');
  canvas.id = 'benchmarkCapabilityOverlay';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:8;contain:strict;opacity:.96';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!ctx) { canvas.remove(); return; }

  const state = {
    width: 1,
    height: 1,
    dpr: 1,
    particles: [],
    rings: [],
    event: null,
    eventUntil: 0,
    nextAmbientEvent: performance.now() + 14000,
    windX: profile.wind || 0,
    windY: 0,
    frameMs: 16.7,
    fps: 60,
    quality: tier,
    visible: !document.hidden,
    last: performance.now(),
    weatherOverride: null,
    sequence: 0
  };

  function resize() {
    state.dpr = Math.min(devicePixelRatio || 1, tier === 2 ? 1.5 : 1.1);
    state.width = innerWidth;
    state.height = innerHeight;
    canvas.width = Math.max(1, Math.floor(innerWidth * state.dpr));
    canvas.height = Math.max(1, Math.floor(innerHeight * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { state.visible = !document.hidden; state.last = performance.now(); });
  resize();

  function hash(value) {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function rnd(seed) { return hash(`${profile.id}:${state.sequence++}:${seed}:${Math.floor(performance.now() / 900)}`); }

  function particle(kind, x, y, strength = 1) {
    if (state.particles.length >= budget) state.particles.splice(0, Math.ceil(budget * 0.08));
    const r = rnd(kind + x + y);
    const life = kind === 'rain' ? 0.75 : kind === 'debris' ? 1.15 : kind === 'star' ? 5 : 1.8;
    state.particles.push({
      kind, x, y, px: x, py: y,
      vx: (r - 0.5) * (kind === 'debris' ? 260 : 50) * strength + state.windX * 54,
      vy: kind === 'rain' ? 680 * strength : kind === 'snow' ? 45 : kind === 'ember' ? -42 - r * 50 : (0.5 - r) * 35,
      life, maxLife: life,
      size: kind === 'rain' ? 1.2 : kind === 'debris' ? 2 + r * 5 : 1 + r * 2.8,
      spin: r * Math.PI * 2,
      hue: Math.floor(185 + r * 110)
    });
  }

  function burst(x = state.width / 2, y = state.height / 2, kind = 'spark', count = 18, strength = 1) {
    const cap = Math.min(count, Math.max(4, Math.floor(budget * 0.35)));
    for (let i = 0; i < cap; i++) particle(kind, x + (rnd(i) - 0.5) * 18, y + (rnd(i + 99) - 0.5) * 18, strength);
    state.rings.push({ x, y, radius: 4, alpha: 0.72, speed: 170 * strength });
  }

  function trigger(type, options = {}) {
    const now = performance.now();
    const duration = Math.max(500, Math.min(14000, Number(options.duration || 5200)));
    state.event = { type, started: now, duration, x: Number(options.x ?? state.width * (0.35 + rnd(type) * 0.3)), y: Number(options.y ?? state.height * 0.56), power: Math.max(0.2, Math.min(2.5, Number(options.power || 1))) };
    state.eventUntil = now + duration;
    if (type === 'impact') burst(state.event.x, state.event.y, 'debris', tier === 2 ? 34 : 18, state.event.power);
    if (type === 'pulse' || type === 'lens') state.rings.push({ x: state.event.x, y: state.event.y, radius: 10, alpha: 0.9, speed: 95 });
    window.dispatchEvent(new CustomEvent('world-capability-event', { detail: { world: profile.id, type, duration } }));
    return state.event;
  }

  function ambientKind() {
    if (state.weatherOverride) return state.weatherOverride;
    if (profile.precip === 'music') return 'note';
    if (profile.precip === 'stars') return 'star';
    if (profile.precip === 'dust') return 'dust';
    if (profile.precip === 'motes') return 'spark';
    return profile.precip || profile.motes || 'mote';
  }

  function spawnAmbient(dt) {
    if (tier === 0) return;
    const kind = ambientKind();
    const activeRain = state.event?.type === 'rain' || kind === 'rain';
    const rate = activeRain ? (tier === 2 ? 42 : 22) : (tier === 2 ? 8 : 4);
    const count = Math.min(4, Math.floor(rate * dt + rnd('spawn') * 1.2));
    for (let i = 0; i < count; i++) {
      const x = rnd(i + 'x') * state.width;
      const y = kind === 'rain' || kind === 'snow' ? -12 : rnd(i + 'y') * state.height;
      particle(kind === 'voxel' ? 'dust' : kind, x, y, activeRain ? 1.1 : 0.7);
    }
  }

  function updateParticles(dt) {
    const gravity = state.event?.type === 'impact' ? 210 : 24;
    const tornado = state.event?.type === 'tornado' ? state.event : null;
    const lens = state.event?.type === 'lens' ? state.event : null;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.px = p.x; p.py = p.y;
      if (tornado) {
        const dx = tornado.x - p.x, dy = tornado.y - p.y;
        const d = Math.max(35, Math.hypot(dx, dy));
        if (d < Math.min(state.width, state.height) * 0.45) {
          p.vx += (-dy / d) * 420 * dt * tornado.power + dx / d * 95 * dt;
          p.vy += (dx / d) * 420 * dt * tornado.power + dy / d * 32 * dt;
        }
      }
      if (lens) {
        const dx = lens.x - p.x, dy = lens.y - p.y, d2 = Math.max(1600, dx * dx + dy * dy);
        p.vx += dx / d2 * 32000 * dt * lens.power;
        p.vy += dy / d2 * 32000 * dt * lens.power;
      }
      p.vx += state.windX * 8 * dt;
      if (p.kind === 'debris') p.vy += gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.spin += dt * 2;
      p.life -= dt;
      if (p.life <= 0 || p.y > state.height + 70 || p.x < -90 || p.x > state.width + 90) state.particles.splice(i, 1);
    }
    for (let i = state.rings.length - 1; i >= 0; i--) {
      const r = state.rings[i]; r.radius += r.speed * dt; r.alpha -= dt * 0.65;
      if (r.alpha <= 0) state.rings.splice(i, 1);
    }
  }

  function drawParticle(p) {
    const alpha = Math.max(0, Math.min(1, p.life / Math.min(0.65, p.maxLife)));
    ctx.globalAlpha = Math.min(0.8, alpha);
    if (p.kind === 'rain') {
      ctx.strokeStyle = 'rgba(176,220,255,.72)'; ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - state.windX * 16, p.y - 18); ctx.stroke();
    } else if (p.kind === 'note') {
      ctx.fillStyle = `hsla(${p.hue},90%,72%,.78)`; ctx.font = `${12 + p.size * 3}px system-ui`; ctx.fillText(rnd(p.x) > .5 ? '♪' : '·', p.x, p.y);
    } else if (p.kind === 'debris') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.fillStyle = 'rgba(210,196,164,.66)'; ctx.fillRect(-p.size, -p.size * .4, p.size * 2, p.size * .8); ctx.restore();
    } else if (p.kind === 'ember') {
      ctx.fillStyle = 'rgba(255,176,82,.74)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'star') {
      ctx.fillStyle = 'rgba(215,235,255,.72)'; ctx.fillRect(p.x, p.y, Math.max(1, p.size * .55), Math.max(1, p.size * .55));
    } else {
      ctx.fillStyle = p.kind === 'dust' ? 'rgba(205,190,150,.22)' : `hsla(${p.hue},90%,72%,.42)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawFog() {
    if (!profile.fog) return;
    const g = ctx.createLinearGradient(0, state.height * .2, 0, state.height);
    const dark = profile.space ? '5,9,20' : '205,220,228';
    g.addColorStop(0, `rgba(${dark},0)`); g.addColorStop(1, `rgba(${dark},${profile.fog})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawTornado(e, t) {
    const h = Math.min(state.height * .62, 480) * e.power;
    ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = .22;
    for (let i = 0; i < (tier === 2 ? 9 : 5); i++) {
      const yy = -h * i / 9;
      const width = 16 + (h + yy) * .16;
      ctx.strokeStyle = `rgba(220,232,238,${.16 + i * .015})`; ctx.lineWidth = 2 + i * .3;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2.4; a += .22) {
        const r = width * (0.72 + .18 * Math.sin(a * 3 + t * .004));
        const x = Math.cos(a + t * .003 + i) * r;
        const y = yy - a * 6;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWave(e, t) {
    const progress = Math.min(1, (t - e.started) / e.duration);
    const y = state.height * (.86 - progress * .48);
    const amp = 14 + 20 * e.power;
    ctx.beginPath(); ctx.moveTo(0, state.height); ctx.lineTo(0, y);
    for (let x = 0; x <= state.width + 24; x += 24) ctx.lineTo(x, y + Math.sin(x * .028 + t * .004) * amp);
    ctx.lineTo(state.width, state.height); ctx.closePath();
    const g = ctx.createLinearGradient(0, y, 0, state.height); g.addColorStop(0, 'rgba(100,205,255,.24)'); g.addColorStop(1, 'rgba(10,60,100,.08)');
    ctx.fillStyle = g; ctx.fill();
  }

  function drawLens(e, t) {
    const elapsed = (t - e.started) / 1000;
    const pulse = 1 + Math.sin(elapsed * 2) * .04;
    const r = Math.min(state.width, state.height) * .075 * e.power * pulse;
    const g = ctx.createRadialGradient(e.x, e.y, r * .1, e.x, e.y, r * 2.8);
    g.addColorStop(0, 'rgba(0,0,0,.82)'); g.addColorStop(.34, 'rgba(0,0,0,.72)'); g.addColorStop(.46, 'rgba(190,215,255,.18)'); g.addColorStop(.54, 'rgba(255,190,95,.18)'); g.addColorStop(.7, 'rgba(10,10,25,.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r * 2.8, 0, Math.PI * 2); ctx.fill();
  }

  function drawOrbit(e, t) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.globalAlpha = .48;
    for (let i = 1; i <= 4; i++) {
      const r = 24 + i * 22 * e.power;
      ctx.strokeStyle = 'rgba(180,210,255,.22)'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * .38, -.35, 0, Math.PI * 2); ctx.stroke();
      const a = t * .0004 * (5 - i) + i;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * .38;
      ctx.fillStyle = `hsla(${35 + i * 45},85%,70%,.85)`; ctx.beginPath(); ctx.arc(x, y, 2 + i * .35, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawEvent(now) {
    if (!state.event || now >= state.eventUntil) { state.event = null; return; }
    const e = state.event;
    if (e.type === 'tornado') drawTornado(e, now);
    else if (e.type === 'wave') drawWave(e, now);
    else if (e.type === 'lens') drawLens(e, now);
    else if (e.type === 'orbit') drawOrbit(e, now);
    else if (e.type === 'lightning') {
      const phase = (now - e.started) / 600;
      if (phase < 1) { ctx.fillStyle = `rgba(230,242,255,${(1 - phase) * .20})`; ctx.fillRect(0, 0, state.width, state.height); }
    }
  }

  function maybeSchedule(now) {
    if (tier === 0 || now < state.nextAmbientEvent || state.event) return;
    const list = profile.events || [];
    if (list.length) trigger(list[Math.floor(rnd('event') * list.length)], { duration: 3600 + rnd('duration') * 3300, power: .55 + rnd('power') * .65 });
    state.nextAmbientEvent = now + 22000 + rnd('next') * 26000;
  }

  function adapt(frameMs) {
    state.frameMs = state.frameMs * .94 + frameMs * .06;
    state.fps = 1000 / Math.max(1, state.frameMs);
    if (state.frameMs > 29 && budget > 42) budget = Math.max(42, Math.floor(budget * .9));
    else if (state.frameMs < 18 && budget < (tier === 2 ? 150 : 84)) budget += 1;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!state.visible) return;
    const frameMs = Math.min(80, now - state.last); state.last = now;
    const dt = frameMs / 1000;
    adapt(frameMs); maybeSchedule(now); spawnAmbient(dt); updateParticles(dt);
    ctx.clearRect(0, 0, state.width, state.height);
    drawFog(); drawEvent(now);
    for (const p of state.particles) drawParticle(p);
    ctx.globalAlpha = 1;
    for (const r of state.rings) { ctx.strokeStyle = `rgba(180,225,255,${Math.max(0, r.alpha)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2); ctx.stroke(); }
  }

  function setWeather(kind) {
    const allowed = new Set(['rain', 'snow', 'dust', 'ember', 'note', 'star', 'spark', 'mote', null]);
    state.weatherOverride = allowed.has(kind) ? kind : null;
  }

  window.WorldCapabilities = {
    version: '1.0.0-benchmark-pack',
    source: 'AI Benchmark Pack synthesis',
    world: profile.id,
    tier,
    trigger,
    burst,
    setWeather,
    setProfile(next) { if (next && typeof next === 'object') profile = { ...profile, ...next }; },
    getStats() { return { fps: Math.round(state.fps), particles: state.particles.length, budget, tier, event: state.event?.type || null, world: profile.id }; }
  };

  if (!reducedMotion) {
    setTimeout(() => {
      if (!state.event) trigger(profile.signature || profile.events?.[0] || 'rain', { duration: 4200, power: .72 });
    }, 1400);
  }

  window.addEventListener('world-impact', event => {
    const detail = event.detail || {};
    burst(Number(detail.x || state.width / 2), Number(detail.y || state.height / 2), detail.kind || 'debris', Number(detail.count || 20), Number(detail.power || 1));
  });
  window.addEventListener('world-weather', event => setWeather(event.detail?.kind || null));

  const weatherLabel = document.getElementById('weather');
  if (weatherLabel && 'MutationObserver' in window) {
    const sync = () => {
      const text = weatherLabel.textContent.toLowerCase();
      if (text.includes('rain') || text.includes('дожд')) setWeather('rain');
      else if (text.includes('snow') || text.includes('снег')) setWeather('snow');
      else if (text.includes('storm') || text.includes('бур')) { setWeather('rain'); if (!state.event) trigger('lightning', { duration: 900 }); }
      else if (profile.id === 'world-sharabass') setWeather('note');
    };
    new MutationObserver(sync).observe(weatherLabel, { childList: true, subtree: true, characterData: true }); sync();
  }

  requestAnimationFrame(frame);
})();
