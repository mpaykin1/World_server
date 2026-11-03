#!/usr/bin/env node
'use strict';
// Измеряемый процент готовности системы из семи движков.
// Единственный писатель architecture/engines/score.json. Руками процент не править.
// Использование: node scripts/engines-score.cjs [--run] [--write] [--check] [--next] [--json]
//   --run    запускает `node --test <файл>` для проверок типа "test" (в CI обязательно)
//   --write  записывает score.json (отказывает, если процент упал)
//   --check  завершается с кодом 1, если процент ниже записанного в score.json
//   --next   печатает до трёх следующих шагов (ENGINES и VISIBLE)
//   --automation-audit  read-only проверка свежести last_run и чередования REUSE/IGRY
// Проверки второй репы (repo: "meta6") читаются из каталога META6_DIR; без него они «unknown» и не засчитываются.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join('architecture', 'engines');
const GATES = ['G1', 'G2', 'G3', 'G4', 'G5'];

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }

function resolveFile(check, root, meta6) {
  if (check.repo === 'meta6') return meta6 ? path.join(meta6, check.p) : null;
  return path.join(root, check.p);
}

function runCheck(check, ctx) {
  const file = resolveFile(check, ctx.root, ctx.meta6);
  if (!file) return { ok: false, unknown: true, why: 'нет META6_DIR' };
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { ok: false, why: 'нет файла ' + check.p };
  const text = fs.readFileSync(file, 'utf8');
  if (check.min && text.length < check.min) return { ok: false, why: check.p + ' короче ' + check.min };
  switch (check.t) {
    case 'file': return { ok: true };
    case 'has': return new RegExp(check.re).test(text) ? { ok: true } : { ok: false, why: check.p + ' не содержит /' + check.re + '/' };
    case 'headings': {
      const miss = (check.all || []).filter((h) => !new RegExp('^#+\\s*' + h, 'mi').test(text));
      return miss.length ? { ok: false, why: check.p + ' без разделов: ' + miss.join(', ') } : { ok: true };
    }
    case 'test': {
      if (!ctx.run || !/\.(js|mjs|cjs)$/.test(check.p)) return { ok: true };
      const r = cp.spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', cwd: ctx.root });
      return r.status === 0 ? { ok: true } : { ok: false, why: 'тест ' + check.p + ' не прошёл' };
    }
    default: return { ok: false, why: 'неизвестный тип ' + check.t };
  }
}

function evaluate(def, ctx) {
  const engines = {};
  for (const e of def.engines) {
    const gates = {}; const fails = {};
    for (const g of GATES) {
      const results = (e.checks[g] || []).map((c) => runCheck(c, ctx));
      gates[g] = results.length > 0 && results.every((r) => r.ok);
      if (!gates[g]) fails[g] = results.filter((r) => !r.ok).map((r) => r.why || 'нет проверки');
    }
    const pct = GATES.filter((g) => gates[g]).length * 20;
    engines[e.id] = { pct, gates, required: e.required !== false, fails };
  }
  const infra = {};
  for (const i of def.infra || []) infra[i.id] = i.checks.every((c) => runCheck(c, ctx).ok);
  const req = Object.entries(engines).filter(([, v]) => v.required);
  const manualDone = readJson(path.join(ctx.root, DIR, 'manual-done.json')) || {};
  const visible = {};
  for (const v of def.visible_backlog || []) visible[v.id] = v.manual ? Boolean(manualDone[v.id]) : v.checks.every((c) => runCheck(c, ctx).ok);
  const overall = Math.round(req.reduce((s, [, v]) => s + v.pct, 0) / (req.length || 1));
  return { overall, engines, infra, visible };
}

function nextSteps(def, result) {
  const done = (id, gate) => result.engines[id] && result.engines[id].gates[gate];
  const steps = [];
  for (const i of def.infra || []) {
    if (!result.infra[i.id] && (i.after || []).every((a) => result.infra[a])) steps.push({ lane: 'ENGINES', id: i.id, title: i.title });
  }
  for (const e of def.engines) {
    const idx = GATES.findIndex((g) => !result.engines[e.id].gates[g]);
    if (idx < 0) continue;
    const gate = GATES[idx];
    const needs = gate === 'G1' || (e.after || []).every((a) => done(a.engine, a.gate));
    const blocked = (e.blocked_by_owner || {})[gate] || [];
    if (!needs || blocked.length) { if (needs) steps.push({ lane: 'OWNER', id: e.id + '.' + gate, blocked_by_owner: blocked, title: e.title }); continue; }
    steps.push({ lane: 'ENGINES', id: e.id + '.' + gate, engine_order: e.order, title: e.title + ': ' + def.gates[gate], checks: e.checks[gate] });
  }
  for (const v of def.visible_backlog || []) {
    if (!result.visible[v.id] && (v.after || []).every((a) => result.visible[a])) steps.push({ lane: 'VISIBLE', id: v.id, engine_order: 0, title: v.title, manual: Boolean(v.manual), checks: v.checks });
  }
  // Обязательные движки прежде необязательного calc; G4–G5 после ядра.
  const priority = [
    'dramaturgy.G2', 'dramaturgy.G3',
    'pipeline.G1', 'pipeline.G2', 'pipeline.G3',
    'onboarding.G2', 'onboarding.G3',
    'dramaturgy.G4', 'dramaturgy.G5',
    'story.G4', 'story.G5',
    'pipeline.G4', 'pipeline.G5',
    'onboarding.G4', 'onboarding.G5'
  ];
  const rank = (step) => {
    const explicit = priority.indexOf(step.id);
    if (explicit !== -1) return explicit;
    const engine = def.engines.find(e => step.id.startsWith(e.id + '.'));
    return engine && engine.required === false ? 2000 : 1000;
  };
  const pick = (lane) => steps.filter(s => s.lane === lane).sort((a, b) =>
    rank(a) - rank(b) || (a.engine_order || 0) - (b.engine_order || 0) ||
    Number(a.manual || 0) - Number(b.manual || 0))[0];
  return { ENGINES: pick('ENGINES') || null, VISIBLE: pick('VISIBLE') || null, OWNER_QUEUE: steps.filter((s) => s.lane === 'OWNER').map((s) => s.id + ' ждёт ' + s.blocked_by_owner.join(',')) };
}

function regressions(result, stored) {
  if (!stored) return [];
  const out = [];
  for (const [id, v] of Object.entries(stored.engines || {})) {
    const now = result.engines[id] ? result.engines[id].pct : 0;
    if (now < v.pct) out.push(id + ': было ' + v.pct + '%, стало ' + now + '%');
  }
  return out;
}

// Проверка пяти существующих автозадач. В обычном режиме ничего не записывает.
// --record-blocker разрешён только в рабочей ветке: коммит и PR делает вызывающая задача.
function automationAudit(root, now = new Date()) {
  const state = readJson(path.join(root, 'architecture', 'reuse-state.json')) || {};
  const history = Array.isArray(state.run_history) ? state.run_history : [];
  const ageMinutes = stamp => {
    const ms = Date.parse(stamp || '');
    return Number.isFinite(ms) ? Math.max(0, Math.floor((now.getTime() - ms) / 60000)) : null;
  };
  const lastRunAge = ageMinutes(state.last_run?.time_tbilisi);
  const actualRuns = history.filter(x => x?.stage !== 'RECOVERY' && x?.time_tbilisi);
  const lastActual = actualRuns.length ? actualRuns[actualRuns.length - 1].time_tbilisi : null;
  const actualRunAge = ageMinutes(lastActual);
  const git = cp.spawnSync('git', [
    'log', '-1', '--format=%cI', '--',
    'architecture/reuse-state.json', 'architecture/automation-config.md',
    'scripts/engines-score.cjs'
  ], { cwd: root, encoding: 'utf8', timeout: 5000 });
  const lastCommit = git.status === 0 ? git.stdout.trim() || null : null;
  const commitAge = ageMinutes(lastCommit);
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi', hour: '2-digit', hourCycle: 'h23'
  }).format(now));
  const expectedLane = hour % 2 ? 'REUSE' : 'IGRY';
  const recent = actualRuns.filter(x => x.time_tbilisi >= '2026-11-03');
  const laneViolations = recent.filter(x => {
    const h = Number(String(x.time_tbilisi).slice(11, 13));
    return x.lane !== (h % 2 ? 'REUSE' : 'IGRY');
  }).length;
  const gameFile = f => typeof f === 'string'
    && /^(ashen-sumerek|underwater-sumerek|underwater-world|three-worlds-game|observer-world[^/]*|island-sumerek[^/]*|abyss[^/]*)\/.+\.(html|js|mjs|css|glsl|vert|frag|png|jpg|webp|svg|glb|gltf|ogg)$/i.test(f)
    && !/(^|\/)(stand|accepted|V5|V6|V7|reference|test|docs|work-notes)\//i.test(f);
  const finished = recent.filter(x => x.stage === 'RELEASE' && x.pr
    && /^(MERGED|DONE)/.test(String(x.result || '')));
  let visibleViolations = 0;
  for (let i = 1; i < finished.length; i += 2) {
    const pair = finished.slice(i - 1, i + 1);
    if (!pair.some(x => x.lane === 'IGRY'
      && x.visible_id?.startsWith('visible.')
      && Array.isArray(x.changed_game_files) && x.changed_game_files.some(gameFile)
      && x.verified_head_sha && x.sha)) visibleViolations++;
  }
  const commitStale = commitAge === null || commitAge > 180;
  const executionStale = actualRunAge === null || actualRunAge > 180;
  const stale = lastRunAge === null || lastRunAge > 75;
  const red = stale || commitStale || executionStale || laneViolations > 0 || visibleViolations > 0;
  return {
    status: red ? 'RED' : 'OK', expectedLane,
    lastRun: state.last_run?.time_tbilisi || null, staleMinutes: lastRunAge, stale,
    lastActualRun: lastActual, actualRunAgeMinutes: actualRunAge, executionStale,
    lastTrackedCommit: lastCommit, commitAgeMinutes: commitAge, commitStale,
    laneViolations, finishedCycles: finished.length, visibleViolations,
    blocker: state.workflow?.blocker || null, blockerSince: state.blocker_since || null,
    reason: commitStale ? 'AUTOMATION_NO_COMMIT_3H'
      : executionStale ? 'AUTOMATION_NO_EXECUTION_3H'
      : stale ? 'AUTOMATION_LAST_RUN_STALE'
      : laneViolations ? 'AUTOMATION_WRONG_LANE'
      : visibleViolations ? 'AUTOMATION_VISIBLE_GAME_MISSING' : null
  };
}

function recordAuditBlocker(root, audit, now = new Date()) {
  if (!audit.reason) return false;
  const branch = cp.spawnSync('git', ['branch', '--show-current'], {
    cwd: root, encoding: 'utf8', timeout: 5000
  });
  if (branch.status !== 0 || !branch.stdout.trim() ||
      ['master', 'main'].includes(branch.stdout.trim())) {
    throw new Error('BLOCKED: --record-blocker требует рабочую ветку и PR; master не менять');
  }
  const filename = path.join(root, 'architecture', 'reuse-state.json');
  const state = readJson(filename);
  if (!state?.workflow) throw new Error('BLOCKED: reuse-state.json не содержит workflow');
  const cause = audit.reason + ': отсутствие подтверждённого исполнения; статус no_update без chat_ref не объясняет причину';
  if (state.workflow.blocker === cause) return false;
  state.workflow.blocker = cause;
  state.blocker_since ||= new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).format(now).replace(' ', 'T') + '+04:00';
  fs.writeFileSync(filename, JSON.stringify(state, null, 2) + '\n');
  return true;
}

function main(argv) {
  const root = process.env.ENGINES_ROOT ? path.resolve(process.env.ENGINES_ROOT) : ROOT;
  if (argv.includes('--automation-audit')) {
    const audit = automationAudit(root);
    if (argv.includes('--record-blocker')) recordAuditBlocker(root, audit);
    console.log(JSON.stringify(audit, null, 2));
    return audit.status === 'RED' ? 2 : 0;
  }
  const meta6 = process.env.META6_DIR ? path.resolve(process.env.META6_DIR) : null;
  const def = JSON.parse(fs.readFileSync(path.join(root, DIR, 'engines.json'), 'utf8'));
  const scorePath = path.join(root, DIR, 'score.json');
  const stored = fs.existsSync(scorePath) ? JSON.parse(fs.readFileSync(scorePath, 'utf8')) : null;
  const result = evaluate(def, { root, meta6, run: argv.includes('--run') });
  const drops = regressions(result, stored);
  if (argv.includes('--json')) console.log(JSON.stringify({ result, next: nextSteps(def, result) }, null, 2));
  else {
    console.log('ОБЩИЙ ПРОЦЕНТ (обязательные движки + связь): ' + result.overall + '%');
    for (const e of def.engines) {
      const r = result.engines[e.id];
      console.log(String(r.pct).padStart(3) + '%  ' + e.id.padEnd(11) + GATES.map((g) => (r.gates[g] ? g : '--')).join(' ') + (r.required ? '' : '  (необязательный)'));
    }
    console.log('infra: ' + Object.entries(result.infra).map(([k, v]) => k + '=' + (v ? 'ok' : 'нет')).join('  '));
    console.log('видимые шаги в играх: ' + Object.entries(result.visible).map(([k, v]) => k.replace('visible.', '') + '=' + (v ? 'ok' : 'нет')).join('  ') + (meta6 ? '' : '   (без META6_DIR проверки meta6 = unknown)'));
  }
  if (argv.includes('--next')) {
    const choices = nextSteps(def, result);
    if (!meta6 && (def.visible_backlog || []).some(v => (v.checks || []).some(c => c.repo === 'meta6'))) {
      choices.VISIBLE = null;
      choices.VISIBLE_BLOCKED = 'META6_DIR отсутствует: нельзя объявлять существующую игру незавершённой без чтения meta6/main';
    }
    console.log(JSON.stringify(choices, null, 2));
  }
  if (drops.length && (argv.includes('--check') || argv.includes('--write'))) { console.error('РЕГРЕССИЯ: ' + drops.join('; ')); return 1; }
  if (argv.includes('--write')) {
    const out = { as_of: new Date().toISOString(), overall: result.overall, engines: Object.fromEntries(Object.entries(result.engines).map(([k, v]) => [k, { pct: v.pct, gates: v.gates }])), infra: result.infra, visible: result.visible };
    fs.writeFileSync(scorePath, JSON.stringify(out, null, 2) + '\n');
  }
  return 0;
}

module.exports = { evaluate, nextSteps, regressions, runCheck, automationAudit, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
