'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function digest(value, secret = '') { return crypto.createHmac('sha256', secret || 'quality-autopilot-integrity').update(JSON.stringify(value)).digest('hex'); }
function appendAudit(repoRoot, event, secret = process.env.QUALITY_AUDIT_SECRET || '') {
  const file = path.join(repoRoot, 'data', 'quality-autopilot', 'audit-chain.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let prevHash = 'GENESIS';
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    if (lines.length) { try { prevHash = JSON.parse(lines[lines.length - 1]).hash; } catch {} }
  }
  const record = { version: 1, at: new Date().toISOString(), prevHash, event };
  record.hash = digest(record, secret);
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
  return record;
}
function verifyAudit(file, secret = process.env.QUALITY_AUDIT_SECRET || '') {
  if (!fs.existsSync(file)) return { ok: true, count: 0 };
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  let prev = 'GENESIS';
  for (let i = 0; i < lines.length; i++) {
    const r = lines[i];
    const hash = r.hash; const copy = { ...r }; delete copy.hash;
    if (r.prevHash !== prev || digest(copy, secret) !== hash) return { ok: false, index: i, count: lines.length };
    prev = hash;
  }
  return { ok: true, count: lines.length, head: prev };
}
module.exports = { appendAudit, verifyAudit };
