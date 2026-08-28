'use strict';
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const entry = path.resolve(__dirname, '..', 'shared', 'posthog-runtime.entry.js');
const outfile = path.resolve(__dirname, '..', 'shared', 'posthog-runtime.js');

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
  if (!content.includes('WorldServerPostHog')) {
    console.error('Build check failed: WorldServerPostHog not found in bundle');
    process.exit(1);
  }
  console.log(`PostHog runtime built: ${outfile} (${stat.size} bytes)`);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
