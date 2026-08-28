#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const here = __dirname;
const root = path.resolve(process.argv[2] || process.cwd());
const policy = String(process.env.GS360_LICENSE_POLICY || 'permissive-commercial-safe').toLowerCase();
const cat = JSON.parse(fs.readFileSync(path.join(here, 'opensource-catalog.json'), 'utf8'));
const autoAllowed = [], reviewRequired = [], blocked = [];
for (const r of cat.resources || []) {
  if (r.policy === 'auto_allowed') autoAllowed.push(r);
  else if (r.policy === 'review_required' || r.policy === 'auto_allowed_with_model_license_check') reviewRequired.push(r);
  else blocked.push(r);
}
const report = {
  schema: 'world-server.gs360-license-gate/v1',
  generatedAt: new Date().toISOString(),
  policy,
  pass: true,
  autoInstallAllowed: autoAllowed.map(x => x.id),
  reviewRequired: reviewRequired.map(x => x.id),
  blockedByDefault: blocked.map(x => x.id),
  rules: [
    'Automatic downloads/installations may use only resources marked auto_allowed by default.',
    'AGPL/copy-left resources are not forbidden, but integration obligations can matter; require review before vendoring or service integration.',
    'Non-commercial model licenses are blocked by default when server use is commercial or unknown.',
    'Verify licenses of model weights and transitive dependencies separately when the upstream project says they differ.'
  ]
};
const out = path.join(root, 'GS360_LICENSE_GATE.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
