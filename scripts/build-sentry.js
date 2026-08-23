'use strict';
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const entry = path.resolve(__dirname, '..', 'shared', 'sentry-runtime.entry.js');
const outfile = path.resolve(__dirname, '..', 'shared', 'sentry-runtime.js');

if (!fs.existsSync(entry)) {
  console.error('Missing entry:', entry);
  process.exit(1);
}

esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2017',
  outfile,
  minify: true,
  sourcemap: false,
  logLevel: 'info',
}).then(() => {
  const stat = fs.statSync(outfile);
  const content = fs.readFileSync(outfile, 'utf8');
  if (!content.includes('WorldServerSentry')) {
    console.error('Build check failed: WorldServerSentry not found in bundle');
    process.exit(1);
  }
  if (!content.includes('ingest.de.sentry.io')) {
    console.error('Build check failed: ingest domain not found');
    process.exit(1);
  }
  console.log(`Sentry runtime built: ${outfile} (${stat.size} bytes)`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
