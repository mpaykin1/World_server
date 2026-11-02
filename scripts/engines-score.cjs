#!/usr/bin/env node
'use strict';
// Измеряемый процент готовности системы из семи движков.
// Единственный писатель architecture/engines/score.json. Руками процент не править.
// Использование: node scripts/engines-score.cjs [--run] [--write] [--check] [--next] [--json]
//   --run    запускает `node --test <файл>` для проверок типа "test" (в CI обязательно)
//   --write  записывает score.json (отказывает, если процент упал)
//   --check  завершается с кодом 1, если процент ниже записанного в score.json
//   --next   печатает до трёх следующих шагов (ENGINES и VISIBLE)
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
  const pick = (lane) => steps.filter((s) => s.lane === lane).sort((a, b) => (a.engine_order || 0) - (b.engine_order || 0) || Number(a.manual || 0) - Number(b.manual || 0))[0];
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

function main(argv) {
  const root = process.env.ENGINES_ROOT ? path.resolve(process.env.ENGINES_ROOT) : ROOT;
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
  if (argv.includes('--next')) console.log(JSON.stringify(nextSteps(def, result), null, 2));
  if (drops.length && (argv.includes('--check') || argv.includes('--write'))) { console.error('РЕГРЕССИЯ: ' + drops.join('; ')); return 1; }
  if (argv.includes('--write')) {
    const out = { as_of: new Date().toISOString(), overall: result.overall, engines: Object.fromEntries(Object.entries(result.engines).map(([k, v]) => [k, { pct: v.pct, gates: v.gates }])), infra: result.infra, visible: result.visible };
    fs.writeFileSync(scorePath, JSON.stringify(out, null, 2) + '\n');
  }
  return 0;
}

module.exports = { evaluate, nextSteps, regressions, runCheck, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
