'use strict';

const $ = id => document.getElementById(id);
const ui = {
  mode: $('mode'), file: $('file'), fileWrap: $('fileWrap'), buildingParams: $('buildingParams'), mapParams: $('mapParams'),
  generate: $('generate'), health: $('health'), state: $('state'), percent: $('percent'), bar: $('bar'), log: $('log'), files: $('files')
};
let session = null;
let pollTimer = null;
let mocapPreviewRaf = null;
const MOCAP_LINKS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[27,31],[24,26],[26,28],[28,32]];

function setProgress(value, label) {
  const p = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  ui.bar.style.width = `${p}%`;
  ui.percent.textContent = `${p}%`;
  if (label) ui.state.textContent = label;
}

function appendLog(text) {
  ui.log.textContent = `${ui.log.textContent}\n${text}`.trim();
}

async function getSession(force = false) {
  if (!force && session && session.expiresAt > Date.now() + 30_000) return session;
  const res = await fetch('/api/ai3d', { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok || !data.enabled) throw new Error(data.error || data.reason || 'AI3D worker не настроен.');
  session = data;
  return session;
}

async function checkHealth() {
  try {
    const res = await fetch('/api/ai3d?action=health', { cache: 'no-store' });
    const data = await res.json();
    const plugins = data.plugins || {};
    const ready = Object.entries(plugins).filter(([,v]) => v?.available).map(([k]) => k);
    ui.health.textContent = data.ok ? `Worker online · ${ready.length} engines` : 'Worker offline';
    ui.health.className = `health ${data.ok ? 'ok' : 'error'}`;
  } catch {
    ui.health.textContent = 'Worker offline';
    ui.health.className = 'health error';
  }
}

function modeChanged() {
  const m = ui.mode.value;
  ui.fileWrap.classList.toggle('hidden', !['auto', 'image_to_3d', 'depth', 'voxel_city', 'motion_capture'].includes(m));
  ui.file.accept = m === 'motion_capture' ? 'video/mp4,video/webm,video/quicktime,.mov' : 'image/png,image/jpeg,image/webp';
  $('fileLabel').textContent = m === 'motion_capture' ? 'Видео человека, до 30 секунд, неподвижная камера' : 'Исходная картинка';
  ui.file.value = '';
  if (m !== 'motion_capture') { $('mocapPreviewWrap').classList.add('hidden'); cancelAnimationFrame(mocapPreviewRaf); }
  ui.buildingParams.classList.toggle('hidden', m !== 'building');
  ui.mapParams.classList.toggle('hidden', m !== 'map');
}

function paramsForMode() {
  let extra = {};
  const raw = $('advanced').value.trim();
  if (raw) extra = JSON.parse(raw);
  if (ui.mode.value === 'building') {
    extra = {
      ...extra,
      floor: Number($('floors').value), length: Number($('length').value), width: Number($('width').value),
      randomise: Number($('buildingSeed').value), lowPoly: Number($('lowPoly').value)
    };
  }
  if (ui.mode.value === 'map') {
    extra = {
      ...extra,
      preset: $('preset').value, seed: Number($('mapSeed').value), city: $('mapCity').checked,
      terrain: $('mapTerrain').checked, dungeon: $('mapDungeon').checked
    };
  }
  return extra;
}

async function authFetch(path, options = {}) {
  const s = await getSession();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${s.token}`);
  return fetch(`${s.workerUrl}${path}`, { ...options, headers });
}

async function pollJob(id) {
  clearTimeout(pollTimer);
  try {
    let res = await authFetch(`/v1/jobs/${encodeURIComponent(id)}`);
    if (res.status === 401) {
      await getSession(true);
      res = await authFetch(`/v1/jobs/${encodeURIComponent(id)}`);
    }
    const job = await res.json();
    if (!res.ok) throw new Error(job.detail || job.error || 'Не удалось получить состояние задания.');
    setProgress(job.progress, job.status);
    ui.log.textContent = job.message || job.error || `Job ${job.id}\n${job.status}`;
    if (job.status === 'completed') {
      setProgress(100, 'Готово');
      ui.generate.disabled = false;
      renderFiles(job);
      if (job.mode === 'motion_capture') showMotionPreview(job).catch(error => appendLog('Предпросмотр недоступен: ' + error.message));
      return;
    }
    if (job.status === 'failed') {
      ui.generate.disabled = false;
      ui.state.textContent = 'Ошибка';
      ui.state.className = 'error';
      appendLog(job.error || 'Неизвестная ошибка.');
      return;
    }
    pollTimer = setTimeout(() => pollJob(id), 1400);
  } catch (error) {
    ui.generate.disabled = false;
    ui.state.textContent = 'Ошибка связи';
    appendLog(error.message);
  }
}

function renderFiles(job) {
  ui.files.replaceChildren();
  for (const file of job.files || []) {
    const row = document.createElement('div');
    row.className = 'fileButton';
    const meta = document.createElement('span');
    meta.textContent = `${file.name} · ${Math.max(1, Math.round((file.bytes || 0) / 1024))} KB`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Скачать';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        let res = await authFetch(file.url);
        if (res.status === 401) { await getSession(true); res = await authFetch(file.url); }
        if (!res.ok) throw new Error('Не удалось скачать результат.');
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      } catch (error) { appendLog(error.message); }
      finally { button.disabled = false; }
    });
    row.append(meta, button);
    ui.files.appendChild(row);
  }
}

async function generate() {
  cancelAnimationFrame(mocapPreviewRaf);
  $('mocapPreviewWrap').classList.add('hidden');
  ui.generate.disabled = true;
  ui.files.replaceChildren();
  ui.state.className = '';
  setProgress(2, 'Создаю задание');
  ui.log.textContent = '';
  try {
    const s = await getSession();
    const mode = ui.mode.value;
    const form = new FormData();
    form.set('mode', mode);
    form.set('params', JSON.stringify(paramsForMode()));
    if (['auto', 'image_to_3d', 'depth', 'voxel_city', 'motion_capture'].includes(mode)) {
      const file = ui.file.files?.[0];
      if (!file) throw new Error(mode === 'motion_capture' ? 'Выбери видео.' : 'Выбери картинку.');
      if (file.size > s.maxUploadMb * 1024 * 1024) throw new Error(`Файл больше ${s.maxUploadMb} MB.`);
      form.set('file', file, file.name);
    }
    const res = await authFetch('/v1/jobs', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || 'Worker отклонил задание.');
    appendLog(`Job ${data.id} создан.`);
    pollJob(data.id);
  } catch (error) {
    ui.generate.disabled = false;
    ui.state.textContent = 'Ошибка';
    ui.state.className = 'error';
    appendLog(error.message);
  }
}

async function showMotionPreview(job) {
  const result = (job.files || []).find(f => f.name === 'motion-landmarks.json');
  if (!result) return;
  let response = await authFetch(result.url);
  if (response.status === 401) { await getSession(true); response = await authFetch(result.url); }
  if (!response.ok) throw new Error('Не удалось получить траектории.');
  const data = await response.json();
  if (!Array.isArray(data.frames) || data.frames.length < 2) return;
  const wrap = $('mocapPreviewWrap');
  wrap.classList.remove('hidden');
  const canvas = $('mocapPreview'), ctx = canvas.getContext('2d');
  const origin = performance.now(), duration = data.frames[data.frames.length - 1].t;
  const all = data.frames.flatMap(f => f.joints.filter((_, i) => i >= 11 && i <= 32));
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(canvas.width * .8 / Math.max(.05, maxX-minX), canvas.height * .8 / Math.max(.05, maxY-minY));
  const project = p => [(p[0]-(minX+maxX)/2)*scale+canvas.width/2, canvas.height/2-(p[1]-(minY+maxY)/2)*scale];
  function draw(now) {
    if (wrap.classList.contains('hidden')) return;
    const t = ((now-origin)/1000) % Math.max(.001, duration);
    const frame = data.frames.find(f => f.t >= t) || data.frames[data.frames.length-1];
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = '#82dfff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a,b] of MOCAP_LINKS) {
      const pa = project(frame.joints[a]), pb = project(frame.joints[b]);
      ctx.moveTo(pa[0],pa[1]); ctx.lineTo(pb[0],pb[1]);
    }
    ctx.stroke();
    ctx.fillStyle = '#c9eefa'; ctx.font = '15px system-ui';
    ctx.fillText('Diagnostic skeleton · ' + t.toFixed(1) + 's / ' + duration.toFixed(1) + 's', 18, 28);
    mocapPreviewRaf = requestAnimationFrame(draw);
  }
  mocapPreviewRaf = requestAnimationFrame(draw);
}

ui.mode.addEventListener('change', modeChanged);
ui.generate.addEventListener('click', generate);
modeChanged();
checkHealth();
setInterval(checkHealth, 30_000);
