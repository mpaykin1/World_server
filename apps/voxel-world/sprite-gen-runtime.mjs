// Apache-2.0 integration adapter: sprite-gen manifest.json -> Three.js camera-facing NPCs.
// No AI API, external script, or GPU inference runs in the browser.
const MAX_ATLAS_SIDE = 8192;
const MAX_STATES = 48;
const MAX_FRAMES_PER_STATE = 128;

export function validateSpriteGenManifest(input) {
  if (!input || typeof input !== 'object') throw new Error('Missing sprite-gen manifest');
  const layout = input.frame_layout;
  const animation = input.animation;
  const width = layout?.sheetWidth;
  const height = layout?.sheetHeight;
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > MAX_ATLAS_SIDE || height > MAX_ATLAS_SIDE) {
    throw new Error('Invalid sprite atlas dimensions');
  }
  if (!layout.rows || typeof layout.rows !== 'object' ||
      !animation?.rows || typeof animation.rows !== 'object') {
    throw new Error('Missing sprite-gen frame or animation rows');
  }
  const names = Object.keys(layout.rows);
  if (!names.length || names.length > MAX_STATES) throw new Error('Invalid number of animation states');
  const states = {};
  for (const state of names) {
    if (!/^[a-z0-9_-]{1,48}$/i.test(state)) throw new Error('Invalid animation state name');
    const frames = layout.rows[state];
    const row = animation.rows[state];
    if (!Array.isArray(frames) || !frames.length || frames.length > MAX_FRAMES_PER_STATE || !row) {
      throw new Error('Invalid animation row: ' + state);
    }
    const fps = Number(row.fps);
    if (!Number.isFinite(fps) || fps <= 0 || fps > 60) throw new Error('Invalid animation speed: ' + state);
    const durations = frames.map((rect, i) => {
      if (!rect || !['x', 'y', 'w', 'h'].every(k => Number.isInteger(rect[k]))) {
        throw new Error('Invalid frame rectangle: ' + state);
      }
      if (rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1 ||
          rect.x + rect.w > width || rect.y + rect.h > height) {
        throw new Error('Frame is outside sprite atlas: ' + state);
      }
      const duration = row.durations_ms?.[i] ?? Math.round(1000 / fps);
      if (!Number.isInteger(duration) || duration < 1 || duration > 60000) {
        throw new Error('Invalid frame duration: ' + state);
      }
      return duration;
    });
    states[state] = {
      frames: frames.map(({x, y, w, h}) => ({x, y, w, h})),
      durations,
      totalMs: durations.reduce((a, b) => a + b, 0),
      loop: row.loop !== false,
      fps
    };
  }
  return {width, height, states, characterId: String(input.characterId || 'sprite').slice(0,72)};
}

export function frameAtTime(state, elapsedMs) {
  if (!state?.frames?.length) throw new Error('Animation state has no frames');
  let t = Math.max(0, Number(elapsedMs) || 0);
  if (state.loop) t %= state.totalMs;
  else t = Math.min(t, state.totalMs - 1);
  for (let i = 0; i < state.frames.length; i++) {
    if (t < state.durations[i]) return {index: i, rect: state.frames[i]};
    t -= state.durations[i];
  }
  return {index: state.frames.length - 1, rect: state.frames.at(-1)};
}

function demoAtlas(kind) {
  const width = 80, height = 96, count = 4;
  const canvas = document.createElement('canvas');
  canvas.width = width * count;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  for (let row = 0; row < 2; row++) for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(i * width, row * height);
    const bob = row ? [0, -4, 0, -2][i] : [0, -2, -1, -2][i];
    const step = row ? [0, 4, 0, -4][i] : 0;
    ctx.translate(0, bob);
    ctx.imageSmoothingEnabled = false;
    if (kind === 'slime') {
      ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.beginPath(); ctx.ellipse(40, 87, 24, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#143c55'; ctx.beginPath(); ctx.ellipse(40, 68, 29, row && i % 2 ? 17 : 24, 0, Math.PI, 2*Math.PI); ctx.lineTo(69, 82); ctx.lineTo(11, 82); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2ee2ba'; ctx.beginPath(); ctx.ellipse(40, 62, 27, row && i % 2 ? 17 : 24, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#91ffe0'; ctx.beginPath(); ctx.ellipse(32, 49, 14, 6, -.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#112738'; ctx.fillRect(28 + step/4, 59, 5, 8); ctx.fillRect(49 + step/4, 59, 5, 8);
      ctx.fillStyle = '#f8fffb'; ctx.fillRect(29 + step/4, 59, 2, 3); ctx.fillRect(50 + step/4, 59, 2, 3);
      ctx.strokeStyle = '#125365'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(40, 68, 5, .25, 2.9); ctx.stroke();
    } else if (kind === 'fox') {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(40, 88, 21, 4, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e26e34'; ctx.beginPath(); ctx.moveTo(42, 66); ctx.bezierCurveTo(75 + step, 40, 75, 87, 58, 81); ctx.lineTo(42, 77); ctx.fill();
      ctx.fillStyle = '#ffb85f'; ctx.fillRect(28, 60, 25, 22);
      ctx.fillStyle = '#412b37'; ctx.fillRect(28 + step/3, 78, 7, 10); ctx.fillRect(46 - step/3, 78, 7, 10);
      ctx.fillStyle = '#e47a35'; ctx.beginPath(); ctx.moveTo(22, 38); ctx.lineTo(22, 12); ctx.lineTo(39, 31); ctx.lineTo(53, 11); ctx.lineTo(62, 43); ctx.lineTo(60, 63); ctx.lineTo(22, 63); ctx.fill();
      ctx.fillStyle = '#ffcf86'; ctx.beginPath(); ctx.moveTo(22, 46); ctx.lineTo(40, 59); ctx.lineTo(60, 46); ctx.lineTo(49, 68); ctx.lineTo(31, 68); ctx.fill();
      ctx.fillStyle = '#2a2f3a'; ctx.fillRect(30, 44, 5, 6); ctx.fillRect(49, 44, 5, 6); ctx.fillRect(39, 57, 5, 4);
      ctx.fillStyle = '#ffdaa0'; ctx.fillRect(27, 24, 4, 12); ctx.fillRect(52, 23, 4, 12);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(31, 44, 2, 2); ctx.fillRect(50, 44, 2, 2);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(40, 88, 22, 5, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#334967'; ctx.fillRect(23 + step/3, 69, 12, 19); ctx.fillRect(45 - step/3, 69, 12, 19);
      ctx.fillStyle = '#4ba7c6'; ctx.fillRect(19, 35, 42, 39);
      ctx.fillStyle = '#a5ebef'; ctx.fillRect(15, 18, 50, 34);
      ctx.fillStyle = '#193b5d'; ctx.fillRect(20, 24, 40, 20);
      ctx.fillStyle = '#71ffdf'; ctx.fillRect(27, 30, 10, 7); ctx.fillRect(46, 30, 10, 7);
      ctx.fillStyle = '#f3bb6f'; ctx.fillRect(38, 9, 4, 10); ctx.fillRect(35, 7, 10, 5);
      ctx.fillStyle = '#274c68'; ctx.fillRect(11 + step/3, 41, 8, 23); ctx.fillRect(61 - step/3, 41, 8, 23);
      ctx.fillStyle = '#f1d081'; ctx.fillRect(32, 58, 16, 8);
    }
    ctx.restore();
  }
  const manifest = {
    characterId: kind,
    engine: 'world-server-procedural-demo',
    game_input: 'demo.png',
    animation: {rows: {
      idle: {fps: 5, loop: true, durations_ms: [200,200,200,200]},
      walk: {fps: 7, loop: true, durations_ms: [140,140,140,140]}
    }},
    frame_layout: {
      sheetWidth: canvas.width, sheetHeight: canvas.height,
      rows: {
        idle: Array.from({length: count}, (_, i) => ({x:i*width,y:0,w:width,h:height})),
        walk: Array.from({length: count}, (_, i) => ({x:i*width,y:height,w:width,h:height}))
      }
    }
  };
  return {canvas, manifest};
}

function makePanel() {
  const style = document.createElement('style');
  style.textContent = '.sprite-gen-panel{position:fixed;right:12px;top:76px;z-index:58;width:192px;padding:10px;background:rgba(9,22,31,.83);border:1px solid rgba(142,248,219,.43);box-shadow:0 8px 28px #0005;border-radius:12px;color:white;font:12px/1.4 system-ui;backdrop-filter:blur(8px)}.sprite-gen-panel strong{display:block;color:#a5ffe5;font-size:14px;margin-bottom:6px}.sprite-gen-panel button,.sprite-gen-panel label{cursor:pointer;display:block;width:100%;box-sizing:border-box;border:1px solid #6bddbe;border-radius:7px;background:#183e47;color:#e7fff7;padding:7px 5px;text-align:center;font:12px system-ui;margin-top:7px}.sprite-gen-panel label{background:#26394c}.sprite-gen-panel input{position:absolute;width:1px;height:1px;opacity:0}.sprite-gen-panel small{display:block;color:#c8d6d3;margin-top:5px}@media(max-width:640px){.sprite-gen-panel{top:62px;right:7px;width:148px;padding:7px}.sprite-gen-panel strong{font-size:12px}.sprite-gen-panel button,.sprite-gen-panel label{font-size:11px;padding:5px 3px}}';
  document.head.appendChild(style);
  const el = document.createElement('section');
  el.className = 'sprite-gen-panel';
  el.setAttribute('aria-label', 'Анимированные существа');
  el.innerHTML = '<strong>✨ Живые существа</strong><div class="sprite-gen-counter" aria-live="polite">Загрузка…</div><button type="button" class="sprite-gen-toggle" aria-pressed="true">Скрыть существ</button><label>➕ Импорт спрайтов<input class="sprite-gen-files" type="file" multiple accept=".json,.png,.webp,application/json,image/png,image/webp"></label><small>Демо без платного ИИ.<br>Импорт: manifest.json + PNG.</small>';
  document.body.appendChild(el);
  return {
    el, button: el.querySelector('.sprite-gen-toggle'),
    input: el.querySelector('.sprite-gen-files'),
    counter: el.querySelector('.sprite-gen-counter')
  };
}

async function loadImage(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  if (img.decode) await img.decode();
  else await new Promise((resolve, reject) => {img.onload=resolve; img.onerror=reject;});
  return img;
}

export function installSpriteGenNPCs({THREE, scene, player, groundHeight}) {
  const panel = makePanel();
  const creatures = [];
  const range = 35;
  let enabled = true;
  let lastError = '';
  const mark = () => {
    panel.counter.textContent = lastError || (enabled ? creatures.length + ' анимированных существа' : 'Существа скрыты');
    panel.button.textContent = enabled ? 'Скрыть существ' : 'Показать существ';
    panel.button.setAttribute('aria-pressed', String(enabled));
  };
  function applyFrame(creature, state, now) {
    const anim = creature.manifest.states[state] || creature.manifest.states.idle ||
      Object.values(creature.manifest.states)[0];
    const next = frameAtTime(anim, now - creature.stateSince);
    if (creature.lastState === state && creature.lastFrame === next.index) return;
    creature.lastState = state;
    creature.lastFrame = next.index;
    const {x,y,w,h} = next.rect;
    creature.texture.repeat.set(w / creature.manifest.width, h / creature.manifest.height);
    creature.texture.offset.set(x / creature.manifest.width, 1 - (y + h) / creature.manifest.height);
    creature.texture.updateMatrix();
  }
  function addCreature({manifest, image, label, kind='custom', lateral=0, distance=5}) {
    if (creatures.length >= 8) throw new Error('Максимум 8 существ в одной сцене');
    const parsed = validateSpriteGenManifest(manifest);
    if (image.width !== parsed.width || image.height !== parsed.height) {
      throw new Error('Размер изображения не совпадает с manifest.json');
    }
    const texture = image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(image) : new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    const material = new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,alphaTest:.045});
    const sprite = new THREE.Sprite(material);
    const size = kind === 'slime' ? 2.1 : kind === 'fox' ? 2.6 : 2.5;
    sprite.scale.set(size * parsed.states[Object.keys(parsed.states)[0]].frames[0].w /
      parsed.states[Object.keys(parsed.states)[0]].frames[0].h, size, 1);
    const creature = {
      sprite, texture, manifest:parsed, label, kind, lateral, distance,
      lastFrame:-1, lastState:'', stateSince:performance.now(), homeX:0, homeZ:0,
      currentState:'idle', lastHomeUpdate:0
    };
    sprite.name = 'SpriteGenNPC:' + parsed.characterId;
    sprite.userData.spriteGen = {characterId:parsed.characterId, states:Object.keys(parsed.states)};
    sprite.renderOrder = 5;
    scene.add(sprite);
    creatures.push(creature);
    placeAhead(creature);
    applyFrame(creature,'idle',performance.now());
    mark();
    return creature;
  }
  function placeAhead(creature) {
    const yaw = Number(player.yaw) || 0;
    const fX = -Math.sin(yaw), fZ = -Math.cos(yaw);
    creature.homeX = player.pos.x + fX * creature.distance + fZ * creature.lateral;
    creature.homeZ = player.pos.z + fZ * creature.distance - fX * creature.lateral;
  }
  for (const [index,kind] of ['slime','fox','robot'].entries()) {
    const asset = demoAtlas(kind);
    addCreature({
      ...asset, image:asset.canvas, label:kind, kind,
      lateral:(index-1)*2.8, distance:index === 1 ? 5.8 : 4.5
    });
  }
  panel.button.addEventListener('click', () => {
    enabled = !enabled;
    for (const c of creatures) c.sprite.visible = enabled;
    mark();
  });
  async function addPublished(id) {
    if (!/^[a-z0-9-]{1,48}$/.test(id)) throw new Error('Invalid sprite ID');
    const directory = '/shared/sprite-gen/' + id + '/';
    const res = await fetch(directory + 'manifest.json', {credentials:'same-origin'});
    if (!res.ok) throw new Error('Missing published sprite: ' + id);
    const manifest = await res.json();
    const atlasName = String(manifest.game_input || 'sprite-sheet-alpha.png');
    if (!/^[a-zA-Z0-9._-]+\.png$/.test(atlasName)) throw new Error('Invalid atlas path');
    const image = await loadImage(directory + atlasName);
    return addCreature({manifest,image,label:id,lateral:3,distance:5});
  }
  async function importFiles(files) {
    const items = [...files];
    const jsonFile = items.find(f => /\.json$/i.test(f.name));
    if (!jsonFile || jsonFile.size > 256000) throw new Error('Выберите manifest.json (до 256 КБ)');
    const manifest = JSON.parse(await jsonFile.text());
    const atlasName = String(manifest.game_input || 'sprite-sheet-alpha.png').split(/[\/\\]/).at(-1);
    const png = items.find(f => f.name === atlasName) || items.find(f => /\.(png|webp)$/i.test(f.name));
    if (!png || png.size > 8 * 1024 * 1024) throw new Error('Добавьте атлас PNG/WebP до 8 МБ');
    validateSpriteGenManifest(manifest);
    const url = URL.createObjectURL(png);
    try {
      const image = await loadImage(url);
      return addCreature({manifest,image,label:manifest.characterId,lateral:0,distance:3.5});
    } finally {URL.revokeObjectURL(url);}
  }
  panel.input.addEventListener('change', async () => {
    try {
      lastError = '';
      await importFiles(panel.input.files || []);
      mark();
    } catch (error) {
      lastError = String(error?.message || error).slice(0,130);
      mark();
    } finally {panel.input.value = '';}
  });
  (async () => {
    try {
      const res = await fetch('/shared/sprite-gen/catalog.json',{credentials:'same-origin'});
      if (!res.ok) return;
      const catalog = await res.json();
      if (!Array.isArray(catalog)) return;
      for (const entry of catalog.slice(0,3)) {
        if (creatures.length >= 8) break;
        try {await addPublished(String(entry.id || ''));}
        catch (e) {console.warn('[sprite-gen] Catalog item skipped:',e.message);}
      }
    } catch (e) {console.warn('[sprite-gen] Catalog unavailable:',e.message);}
  })();
  mark();
  function tick(now, dt) {
    if (!enabled) return;
    for (const [i,c] of creatures.entries()) {
      const dx = c.homeX-player.pos.x, dz=c.homeZ-player.pos.z;
      if (dx*dx + dz*dz > 24*24 && now-c.lastHomeUpdate > 2200) {
        placeAhead(c);
        c.lastHomeUpdate=now;
      }
      const phase = now*.001 + i*2.1;
      const moving = Math.sin(phase*.7) > -.18;
      const state = moving && c.manifest.states.walk ? 'walk' : c.manifest.states.idle ? 'idle' : Object.keys(c.manifest.states)[0];
      if (state !== c.currentState) {c.currentState=state;c.stateSince=now;c.lastFrame=-1;}
      const radius = moving ? 1.15 : .22;
      const x = c.homeX+Math.cos(phase*.73)*radius;
      const z = c.homeZ+Math.sin(phase*.73)*radius;
      const distanceSq = (x-player.pos.x)**2 + (z-player.pos.z)**2;
      c.sprite.visible = distanceSq < range*range;
      if (!c.sprite.visible) continue;
      const half = c.sprite.scale.y*.47;
      c.sprite.position.set(x,groundHeight(Math.floor(x),Math.floor(z))+1+half,z);
      if (distanceSq < 18*18 || Math.floor(now/250)%4===0) applyFrame(c,state,now);
    }
  }
  return {
    tick,
    importFiles,
    addPublished,
    get enabled(){return enabled;},
    stats(){return {enabled, total:creatures.length, visible:creatures.filter(c=>c.sprite.visible).length, error:lastError};},
    dispose(){
      panel.el.remove();
      for (const c of creatures) {scene.remove(c.sprite);c.sprite.material.dispose();c.texture.dispose();}
      creatures.length=0;
    }
  };
}
