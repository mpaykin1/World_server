'use strict';

const path = require('node:path');
const {
  DEFAULT_MAX_AGE_MS,
  gateCertificateStore,
} = require('../lib/fleet-pre-certificate.js');

const root = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { certDir: path.join(root, 'data', 'fleet-pre-certificates') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--head-sha') opts.headSha = next();
    else if (arg === '--base-sha') opts.baseSha = next();
    else if (arg === '--cert-dir') opts.certDir = path.resolve(root, next());
    else if (arg === '--max-age-seconds') opts.maxAgeMs = Number(next()) * 1000;
    else if (arg === '--certifier-must-not-equal') opts.certifierMustNotEqual = next();
    else if (arg === '--json') opts.json = true;
    else {
      console.error(`FAIL: unknown argument ${arg}`);
      process.exit(2);
    }
  }
  if (!opts.headSha || !/^[0-9a-f]{40}$/i.test(opts.headSha)) {
    console.error('FAIL: --head-sha <40-hex> is required');
    process.exit(2);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = gateCertificateStore(opts);
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: result.ok,
          errors: result.errors,
          headSha: opts.headSha,
          certificateId: result.certificate ? result.certificate.certificateId : null,
          certificateFiles: result.files.length,
        },
        null,
        2,
      ) + '\n',
    );
  } else if (result.ok) {
    console.log(
      `OK: Fleet PRE READY_FOR_OCEAN certificate for exact head ${opts.headSha} (certificateId ${result.certificate.certificateId}).`,
    );
  } else {
    for (const error of result.errors) console.error(`FAIL: ${error}`);
    console.error(
      `BLOCKED: no unambiguous Fleet PRE READY_FOR_OCEAN certificate for exact head ${opts.headSha}.`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

main();