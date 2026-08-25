'use strict';

const input = document.getElementById('files');
const drop = document.getElementById('drop');
const queue = document.getElementById('queue');
const temporal = document.getElementById('temporal');
const clear = document.getElementById('clear');
const objectUrls = new Set();
const pending = [];
let active = 0;
const CONCURRENCY = 2;

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function createJob(file) {
  const root = make('article', 'job');
  const preview = make('img', 'preview');
  const inputUrl = URL.createObjectURL(file);
  objectUrls.add(inputUrl);
  preview.src = inputUrl;
  preview.alt = '';
  root.append(preview);

  const body = make('div', 'body');
  body.append(make('h2', '', file.name));
  body.append(make('p', 'meta', `${size(file.size)} · автоматический анализ → repair → verify`));
  const status = make('div', 'status', 'В очереди');
  body.append(status);
  const issues = make('div', 'issues');
  body.append(issues);
  const actions = make('div', 'actions');
  body.append(actions);
  root.append(body);
  queue.prepend(root);
  return { file, root, preview, status, issues, actions };
}

function setStatus(job, text, kind = '') {
  job.status.className = `status ${kind}`.trim();
  job.status.textContent = text;
}

function renderIssues(job, report) {
  job.issues.replaceChildren();
  job.issues.append(make('span', 'badge', `Качество ${report.qualityScore ?? '—'}%`));
  if (report.codec) {
    job.issues.append(make('span', 'badge', `${report.codec.sourceBitDepth || report.codec.bitDepth}-bit${report.codec.sourceInterlacedAdam7 ? ' · Adam7' : ''}`));
  }
  if (!report.issues.length) job.issues.append(make('span', 'badge', 'Дефектов не найдено'));
  for (const issue of report.issues) {
    const suffix = Number.isInteger(issue.frame) ? ` · кадр ${issue.frame + 1}` : '';
    job.issues.append(make('span', 'badge', `${issue.code}${suffix}`));
  }
}

async function processJob(job) {
  setStatus(job, 'Анализ пикселей…');
  const analyzeResponse = await fetch('/api/apng?action=analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: job.file
  });
  const analyzed = await analyzeResponse.json();
  if (!analyzeResponse.ok || !analyzed.ok) throw new Error(analyzed.error || `ANALYZE_${analyzeResponse.status}`);
  renderIssues(job, analyzed.report);

  setStatus(job, 'Исправление и пиксельная верификация…');
  const repairResponse = await fetch(`/api/apng?action=repair&temporal=${temporal.checked ? '1' : '0'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: job.file
  });
  if (!repairResponse.ok) {
    let message = `REPAIR_${repairResponse.status}`;
    try { const error = await repairResponse.json(); message = error.error || message; } catch {}
    throw new Error(message);
  }
  const blob = await repairResponse.blob();

  setStatus(job, 'Независимая повторная проверка результата…');
  const verifyResponse = await fetch('/api/apng?action=analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: blob
  });
  const verified = await verifyResponse.json();
  if (!verifyResponse.ok || !verified.ok) throw new Error(verified.error || `VERIFY_${verifyResponse.status}`);
  const verifyErrors = verified.report.issues.filter((issue) => issue.severity === 'error');
  if (verifyErrors.length) throw new Error(`VERIFY_ERRORS:${verifyErrors.map((issue) => issue.code).join(',')}`);

  const repairedUrl = URL.createObjectURL(blob);
  objectUrls.add(repairedUrl);
  job.preview.src = repairedUrl;
  const summaryRaw = repairResponse.headers.get('X-APNG-Repair');
  let summary = null;
  if (summaryRaw) {
    try {
      const base64 = summaryRaw.replace(/-/g, '+').replace(/_/g, '/');
      summary = JSON.parse(atob(base64));
    } catch {}
  }
  const download = make('a', 'download', 'Скачать исправленный APNG');
  download.href = repairedUrl;
  download.download = job.file.name.replace(/\.apng$|\.png$/i, '') + '.repaired.apng';
  job.actions.append(download);
  job.actions.append(make('span', 'small', `${size(job.file.size)} → ${size(blob.size)}${summary ? ` · действий: ${summary.actions}` : ''}`));
  const quality = repairResponse.headers.get('X-APNG-Quality-Score') || verified.report.qualityScore || '—';
  setStatus(job, `Готово · verify PASS · качество ${quality}% · ${verified.report.frameCount} кадров`, 'ok');
}

function pump() {
  while (active < CONCURRENCY && pending.length) {
    const job = pending.shift();
    active += 1;
    processJob(job).catch((error) => setStatus(job, error.message || 'Ошибка обработки', 'error')).finally(() => {
      active -= 1;
      pump();
    });
  }
}

function enqueue(files) {
  for (const file of files) {
    if (!/\.apng$|\.png$/i.test(file.name) && file.type !== 'image/png') continue;
    pending.push(createJob(file));
  }
  pump();
}

input.addEventListener('change', () => { enqueue(input.files); input.value = ''; });
for (const event of ['dragenter', 'dragover']) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.add('drag'); });
for (const event of ['dragleave', 'drop']) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.remove('drag'); });
drop.addEventListener('drop', (e) => enqueue(e.dataTransfer.files));
clear.addEventListener('click', () => {
  pending.length = 0;
  queue.replaceChildren();
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
});
