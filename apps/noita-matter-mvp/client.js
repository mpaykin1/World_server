(() => {
  'use strict';

  const { MatterWorld } = window.WorldMatter;
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d', { alpha: false });
  const statsEl = document.getElementById('stats');
  const reactionEl = document.getElementById('reaction');
  const pauseBtn = document.getElementById('pause');
  const resetBtn = document.getElementById('reset');

  const X_MIN = -34, X_MAX = 34, Y_MIN = 0, Y_MAX = 58, Z = 0;
  const colors = {
    stone:'#637083', sand:'#e8c66d', water:'#3d9cff', oil:'#7a5b2f',
    wood:'#a85b30', steam:'#d7ecf7', fire:'#ff7a3d', lava:'#ff3f24', ash:'#6b7077'
  };

  let world = null;
  let currentScene = 'mix';
  let currentTool = 'sand';
  let paused = false;
  let painting = false;
  let lastStepAt = 0;
  let previousCounts = {};
  let toastTimer = 0;
  let fps = 60, fpsFrames = 0, fpsClock = performance.now();
  let view = { cell: 8, left: 0, bottom: 0 };

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bottomUi = innerWidth < 760 ? 132 : 128;
    const availableH = Math.max(300, innerHeight - bottomUi - 8);
    const cell = Math.max(3.7, Math.min(innerWidth / (X_MAX - X_MIN + 5), availableH / (Y_MAX + 4), 12));
    view.cell = cell;
    view.left = (innerWidth - (X_MAX - X_MIN + 1) * cell) / 2;
    view.bottom = innerHeight - bottomUi - 6;
  }

  function put(x, y, material, state) {
    if (x <= X_MIN || x >= X_MAX || y <= Y_MIN || y >= Y_MAX) return;
    world.setCell(x, y, Z, material, state);
  }

  function rect(x1, y1, x2, y2, material, state) {
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) put(x, y, material, state);
  }

  function boundary() {
    for (let x = X_MIN; x <= X_MAX; x++) {
      world.setCell(x, Y_MIN, Z, 'stone');
      world.setCell(x, Y_MAX, Z, 'stone');
      for (let y = Y_MIN; y <= Y_MAX; y++) {
        world.setCell(x, y, -1, 'stone');
        world.setCell(x, y, 1, 'stone');
      }
    }
    for (let y = Y_MIN; y <= Y_MAX; y++) {
      world.setCell(X_MIN, y, Z, 'stone');
      world.setCell(X_MAX, y, Z, 'stone');
    }
  }

  function sceneMix() {
    rect(-31, 1, -19, 5, 'oil');
    rect(-31, 6, -19, 9, 'water');
    rect(-31, 25, -19, 31, 'sand');

    rect(-9, 1, -6, 12, 'wood');
    rect(6, 1, 9, 12, 'wood');
    rect(-5, 1, 5, 3, 'wood');
    for (let x = -8; x <= 8; x += 2) put(x, 13, 'wood');
    put(-4, 1, 'fire');

    rect(17, 1, 30, 8, 'water');
    rect(20, 26, 27, 30, 'lava');
    for (let y = 1; y <= 16; y++) {
      world.setCell(13, y, Z, 'stone');
      world.setCell(-14, y, Z, 'stone');
    }
  }

  function sceneLava() {
    rect(-20, 1, 20, 10, 'water');
    rect(-14, 30, 14, 34, 'lava');
    rect(-23, 1, -21, 16, 'stone');
    rect(21, 1, 23, 16, 'stone');
  }

  function sceneFire() {
    rect(-16, 1, -12, 23, 'wood');
    rect(12, 1, 16, 23, 'wood');
    rect(-11, 1, 11, 4, 'wood');
    for (let y = 7; y <= 21; y += 4) rect(-11, y, 11, y + 1, 'wood');
    for (let x = -10; x <= 10; x += 4) rect(x, 5, x + 1, 22, 'wood');
    put(-10, 5, 'fire');
    put(10, 5, 'fire');
  }

  function sceneSand() {
    rect(-28, 1, 28, 5, 'oil');
    rect(-28, 6, 28, 10, 'water');
    rect(-25, 30, 25, 38, 'sand');
    for (let x = -29; x <= 29; x++) {
      if (x % 8 === 0) rect(x, 1, x, 18, 'stone');
    }
  }

  function reset(scene = currentScene) {
    currentScene = scene;
    world = new MatterWorld({ seed: 20261001 });
    boundary();
    if (scene === 'lava') sceneLava();
    else if (scene === 'fire') sceneFire();
    else if (scene === 'sand') sceneSand();
    else sceneMix();
    previousCounts = countMaterials();
    paused = false;
    pauseBtn.textContent = '⏸ ПАУЗА';
    document.querySelectorAll('[data-scene]').forEach(b => b.classList.toggle('active', b.dataset.scene === scene));
  }

  function countMaterials() {
    const counts = {};
    for (const cell of world.snapshot()) {
      if (!cell.position.endsWith(',0')) continue;
      counts[cell.material] = (counts[cell.material] || 0) + 1;
    }
    return counts;
  }

  function toast(text) {
    clearTimeout(toastTimer);
    reactionEl.textContent = text;
    reactionEl.classList.add('show');
    toastTimer = setTimeout(() => reactionEl.classList.remove('show'), 1250);
  }

  function detectReactions() {
    const now = countMaterials();
    if ((now.steam || 0) > (previousCounts.steam || 0) + 2 && (now.stone || 0) > (previousCounts.stone || 0)) {
      toast('🌋 ЛАВА + ВОДА → КАМЕНЬ + ПАР');
    } else if ((now.ash || 0) > (previousCounts.ash || 0)) {
      toast('🔥 ДЕРЕВО СГОРЕЛО → ЗОЛА');
    }
    previousCounts = now;
  }

  function paintAt(clientX, clientY) {
    const x = Math.round((clientX - view.left) / view.cell + X_MIN);
    const y = Math.round((view.bottom - clientY) / view.cell);
    if (x <= X_MIN || x >= X_MAX || y <= 0 || y >= Y_MAX) return;
    const radius = currentTool === 'fire' ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      if (currentTool === 'air') world.setCell(x + dx, y + dy, Z, 'air');
      else put(x + dx, y + dy, currentTool);
    }
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, innerHeight);
    g.addColorStop(0, '#111a2b');
    g.addColorStop(.65, '#08101a');
    g.addColorStop(1, '#05070b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, innerWidth, innerHeight);

    ctx.globalAlpha = .12;
    ctx.strokeStyle = '#7ca0c8';
    ctx.lineWidth = 1;
    for (let y = 0; y <= Y_MAX; y += 5) {
      const py = view.bottom - y * view.cell;
      ctx.beginPath(); ctx.moveTo(view.left, py); ctx.lineTo(view.left + (X_MAX-X_MIN+1)*view.cell, py); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCell(x, y, cell) {
    const px = view.left + (x - X_MIN) * view.cell;
    const py = view.bottom - (y + 1) * view.cell;
    const s = Math.max(1.2, view.cell + .3);
    let color = colors[cell.material] || '#fff';

    if (cell.material === 'fire') {
      const flicker = 0.75 + 0.25 * Math.sin(world.tick * 1.7 + x * 2.1 + y);
      ctx.shadowColor = '#ff8b38'; ctx.shadowBlur = view.cell * 1.8 * flicker;
      color = flicker > .9 ? '#fff0a5' : '#ff6b2f';
    } else if (cell.material === 'lava') {
      ctx.shadowColor = '#ff3f24'; ctx.shadowBlur = view.cell * 1.35;
      color = world.tick % 4 < 2 ? '#ff4b25' : '#ff8a2a';
    } else if (cell.material === 'steam') {
      ctx.globalAlpha = .62;
    }

    ctx.fillStyle = color;
    ctx.fillRect(px, py, s, s);
    if (cell.burning && cell.material !== 'fire') {
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(px + s * .25, py, s * .5, Math.max(1, s * .2));
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    const snapshot = world.snapshot();
    for (const item of snapshot) {
      const [x, y, z] = item.position.split(',').map(Number);
      if (z !== Z || y < Y_MIN || y > Y_MAX || x < X_MIN || x > X_MAX) continue;
      drawCell(x, y, item);
    }
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '700 10px system-ui';
    ctx.fillText('Y ↑', view.left + 7, 95);
  }

  function frame(now) {
    if (!paused && now - lastStepAt >= 28) {
      const loops = Math.min(2, Math.max(1, Math.floor((now - lastStepAt) / 28)));
      for (let i = 0; i < loops; i++) world.step({ maxCells: 50000 });
      lastStepAt = now;
      if (world.tick % 8 === 0) detectReactions();
    }

    render();
    fpsFrames++;
    if (now - fpsClock >= 500) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsClock));
      fpsFrames = 0; fpsClock = now;
      const s = world.stats();
      statsEl.innerHTML = `tick ${s.tick}<br>active ${s.activeCells}<br>${fps} fps · ${s.activeChunks} chunks`;
    }
    requestAnimationFrame(frame);
  }

  document.getElementById('scenarios').addEventListener('click', e => {
    const b = e.target.closest('button[data-scene]');
    if (b) reset(b.dataset.scene);
  });
  document.getElementById('tools').addEventListener('click', e => {
    const b = e.target.closest('button[data-tool]');
    if (!b) return;
    currentTool = b.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === b));
  });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ ПРОДОЛЖИТЬ' : '⏸ ПАУЗА';
  });
  resetBtn.addEventListener('click', () => reset(currentScene));

  canvas.addEventListener('pointerdown', e => {
    painting = true; canvas.setPointerCapture(e.pointerId); paintAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', e => { if (painting) paintAt(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', () => { painting = false; });
  canvas.addEventListener('pointercancel', () => { painting = false; });
  addEventListener('resize', resize);

  resize();
  reset('mix');
  requestAnimationFrame(frame);
})();