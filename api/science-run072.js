'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

const evidencePath = path.join(process.cwd(), 'SCIENCE_RUN_072_H2.json');

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  sendJson(res, 200, {
    run: 'RUN_072',
    production: true,
    sourceCommit: 'f30efebe6021b9dd5fd231840934c4764bfbc8eb',
    evidence,
    cloudAccess: {
      read: { command: 'inspect_logs', args: { file: 'SCIENCE_RUN_072_H2.json' } },
      verify: { command: 'run_existing_script', args: { scriptId: 'science-run-072' } }
    }
  });
});
