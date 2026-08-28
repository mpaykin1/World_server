#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const exts = new Set(['.png', '.webp']);
const ignored = new Set(['node_modules', '.git', '.vercel', 'coverage', 'playwright-report', 'test-results']);

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (exts.has(path.extname(ent.name).toLowerCase())) out.push(p);
  }
  return out;
}

const images = walk(ROOT).map((p) => path.relative(ROOT, p).replaceAll('\\', '/')).sort();
const pixelLike = images.filter((p) => /pixel|sprite|frame|tile|atlas|character|effect|anim/i.test(p));

console.log(JSON.stringify({
  mode: 'scan',
  totalImages: images.length,
  candidatePixelAssets: pixelLike.length,
  candidates: pixelLike,
  decision: pixelLike.length
    ? 'real-assets-found: build atlas with a real packer and verify frame rectangles before registration'
    : 'no-real-pixel-assets-found: keep pixel.animation.atlas.missing open; do not create a fake manifest',
}, null, 2));

if (!pixelLike.length) process.exit(20);
