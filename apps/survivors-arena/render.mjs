// Original Canvas2D art; scales by world units and avoids sprite/asset license ambiguity.
const TAU = Math.PI * 2;
const theme = {
  forest: { ground: '#153329', tile: '#274e38', landmark: '♣' },
  volcano: { ground: '#30242a', tile: '#63453a', landmark: '▲' },
  city: { ground: '#192f40', tile: '#325468', landmark: '▥' },
  village: { ground: '#223841', tile: '#436057', landmark: '⌂' },
  desert: { ground: '#493b30', tile: '#655642', landmark: '◈' },
  default: { ground: '#172b32', tile: '#304751', landmark: '✣' }
};
function circle(ctx, x, y, radius, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
}
export function createPainter(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  const cam = { x: 0, y: 0 };
  let width = 0, height = 0, scale = 1;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 800 ? 1.4 : 1.8);
    width = innerWidth; height = innerHeight;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.max(16, Math.min(34, Math.min(width / 21, height / 23)));
  }
  function point(x, y) { return { x: width / 2 + (x - cam.x) * scale, y: height / 2 + (y - cam.y) * scale }; }
  function background(state, now) {
    const tag = state?.world.tags.find(t => theme[t]) || 'default';
    const palette = theme[tag], grd = ctx.createLinearGradient(0, 0, width, height);
    grd.addColorStop(0, palette.ground); grd.addColorStop(1, '#101b25');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, width, height);
    const step = scale * 2.6, ox = ((-cam.x * scale) % step + step) % step, oy = ((-cam.y * scale) % step + step) % step;
    ctx.strokeStyle = palette.tile + '50'; ctx.lineWidth = 1;
    for (let x = ox; x < width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = oy; y < height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    // Same World Server macro types form the arena's quiet, distant landmarks.
    state?.world.tags.forEach((name, i) => {
      const angle = (i * 2.39996) % TAU, p = point(Math.cos(angle) * (8 + i * 4), Math.sin(angle) * (8 + i * 4));
      ctx.globalAlpha = .13; ctx.font = 'bold ' + Math.round(scale * 4) + 'px system-ui';
      ctx.textAlign = 'center'; ctx.fillStyle = palette.tile;
      ctx.fillText(theme[name]?.landmark || '✣', p.x, p.y); ctx.globalAlpha = 1;
    });
    const fog = ctx.createRadialGradient(width / 2, height / 2, height * .1, width / 2, height / 2, height * .9);
    fog.addColorStop(0, '#00000000'); fog.addColorStop(1, '#070b17b5');
    ctx.fillStyle = fog; ctx.fillRect(0, 0, width, height);
    if (!state) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#5c92a4'; ctx.font = 'bold 36px system-ui';
      ctx.fillText('✧', width / 2, height / 2 + Math.sin(now / 500) * 6);
    }
  }
  function drawGem(g) {
    const p = point(g.x, g.y), r = g.amount > 1 ? 7 : 4.8;
    ctx.fillStyle = '#43e2f7'; ctx.shadowColor = '#2ed9f5'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * .7, p.y);
    ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * .7, p.y); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  }
  function drawEnemy(e, now) {
    const p = point(e.x, e.y), radius = e.radius * scale;
    if (p.x < -radius || p.x > width + radius || p.y < -radius || p.y > height + radius) return;
    const boss = e.boss, body = e.kind === 'ember' ? '#d16d56' : boss ? '#9775c4' : '#576b83';
    circle(ctx, p.x, p.y + radius * .53, radius * .91, '#070d17a0');
    ctx.fillStyle = body; ctx.strokeStyle = boss ? '#c6a4fd' : '#22333f'; ctx.lineWidth = boss ? 3 : 1.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - radius); ctx.quadraticCurveTo(p.x + radius, p.y - radius, p.x + radius, p.y + radius * .8);
    ctx.quadraticCurveTo(p.x, p.y + radius * .48 + Math.sin(now * .007 + e.id) * 2, p.x - radius, p.y + radius * .8);
    ctx.quadraticCurveTo(p.x - radius, p.y - radius, p.x, p.y - radius); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = e.kind === 'ember' ? '#ffe2a5' : '#e3eafa';
    ctx.fillRect(p.x - radius * .5, p.y - radius * .15, radius * .27, radius * .19);
    ctx.fillRect(p.x + radius * .23, p.y - radius * .15, radius * .27, radius * .19);
    if (boss) {
      ctx.fillStyle = '#1b1825'; ctx.fillRect(p.x - radius, p.y - radius - 9, radius * 2, 4);
      ctx.fillStyle = '#e3abff'; ctx.fillRect(p.x - radius, p.y - radius - 9, radius * 2 * Math.max(0, e.hp / e.maxHp), 4);
    }
  }
  function drawHero(state, now) {
    const p = point(state.player.x, state.player.y), r = scale * .38;
    circle(ctx, p.x, p.y + r * .85, r * 1.15, '#060d18a9');
    const glow = state.player.invuln > 0 ? '#ffffff' : state.role === 'warrior' ? '#ffd080' : state.role === 'worker' ? '#7decce' : '#a4b7ff';
    circle(ctx, p.x, p.y, r * 1.34, glow + '25');
    ctx.fillStyle = state.role === 'warrior' ? '#ed9e55' : state.role === 'worker' ? '#59b8a8' : '#778ac7';
    ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 1.25); ctx.lineTo(p.x + r, p.y + r);
    ctx.lineTo(p.x - r, p.y + r); ctx.closePath(); ctx.fill();
    circle(ctx, p.x, p.y - r * .38, r * .52, '#ffdcba');
    ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * state.player.hp / state.player.maxHp); ctx.stroke();
    if (state.evolution) {
      ctx.strokeStyle = '#77e6fd77'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r * (2.2 + .1 * Math.sin(now / 230)), 0, TAU); ctx.stroke();
    }
  }
  function drawEffects(effects) {
    for (const fx of effects) {
      const p = point(fx.x, fx.y), alpha = Math.max(0, fx.life / fx.duration);
      ctx.globalAlpha = alpha;
      if (fx.type === 'number' || fx.type === 'text') {
        ctx.fillStyle = fx.color || '#f3daae'; ctx.font = '700 ' + (fx.type === 'text' ? 20 : 13) + 'px system-ui';
        ctx.textAlign = 'center'; ctx.fillText(fx.value, p.x, p.y - (1 - alpha) * 28);
      } else if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color || '#69d9fb'; ctx.lineWidth = 3 * alpha;
        ctx.beginPath(); ctx.arc(p.x, p.y, fx.radius * scale * (1 - alpha * .72), 0, TAU); ctx.stroke();
      } else if (fx.type === 'arc') {
        const q = point(fx.tx, fx.ty); ctx.strokeStyle = '#9ce8ff'; ctx.lineWidth = 2.5 * alpha;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function paint(state, effects = [], now = 0, reducedMotion = false) {
    if (state) {
      const follow = reducedMotion ? 1 : .13;
      cam.x += (state.player.x - cam.x) * follow; cam.y += (state.player.y - cam.y) * follow;
    }
    background(state, now);
    if (!state) return;
    for (const g of state.gems) drawGem(g);
    for (const e of state.enemies) drawEnemy(e, now);
    for (const shot of state.shots) {
      const p = point(shot.x, shot.y); circle(ctx, p.x, p.y, 4.5, '#fff5b0');
    }
    drawHero(state, now);
    if (!reducedMotion) drawEffects(effects);
  }
  resize();
  return { resize, paint, get metrics() { return { width, height, drawScale: scale, pixels: canvas.width * canvas.height }; } };
}
