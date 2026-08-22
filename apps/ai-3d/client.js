'use strict';

const $ = id => document.getElementById(id);
const ui = {
  mode: $('mode'), file: $('file'), fileWrap: $('fileWrap'), buildingParams: $('buildingParams'), mapParams: $('mapParams'),
  generate: $('generate'), health: $('health'), state: $('state'), percent: $('percent'), bar: $('bar'), log: $('log'), files: $('files')
};
let session = null;
let pollTimer = null;

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
  ui.fileWrap.classList.toggle('hidden', !['auto', 'image_to_3d', 'depth', 'voxel_city'].includes(m));
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
    if (['auto', 'image_to_3d', 'depth', 'voxel_city'].includes(mode)) {
      const file = ui.file.files?.[0];
      if (!file) throw new Error('Выбери картинку.');
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

ui.mode.addEventListener('change', modeChanged);
ui.generate.addEventListener('click', generate);
modeChanged();
checkHealth();
setInterval(checkHealth, 30_000);
