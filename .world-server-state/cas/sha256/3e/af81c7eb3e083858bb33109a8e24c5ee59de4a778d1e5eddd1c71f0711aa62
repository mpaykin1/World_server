#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APPS_ROOT = path.join(ROOT, 'apps');
const registry = require('../data/app-release-registry.json');

const START = '<!-- WORLD_SERVER_PWA:START -->';
const END = '<!-- WORLD_SERVER_PWA:END -->';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function appOptions(appId) {
  const meta = registry.apps?.[appId] || {};
  const title = String(meta.title || appId);
  const icon = '/shared/pwa-icon-180.png';
  return { appId, title, icon };
}

function ensureViewportFit(html) {
  return html.replace(
    /(<meta[^>]+name=["']viewport["'][^>]+content=["'])([^"']*)(["'][^>]*>)/i,
    (match, before, content, after) => {
      if (/viewport-fit=cover/i.test(content)) return match;
      return `${before}${content},viewport-fit=cover${after}`;
    }
  );
}

function stripManagedBlock(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < start) return html;
  const before = html.slice(0, start).replace(/[ \t]*\n?$/, '');
  const after = html.slice(end + END.length).replace(/^\s*\n?/, '');
  return before + after;
}

function injectHtml(html, options) {
  const { appId, title, icon } = options;
  let next = stripManagedBlock(String(html));
  next = ensureViewportFit(next);

  const lines = [
    START,
    `<link rel="manifest" href="/api/pwa-manifest?app=${encodeURIComponent(appId)}">`,
    '<meta name="theme-color" content="#0b0f16">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(title.slice(0, 32))}">`,
    `<link rel="apple-touch-icon" href="${escapeHtml(icon)}">`
  ];

  if (!next.includes('/shared/golden-performance-autotuner.js')) {
    lines.push('<script src="/shared/golden-performance-autotuner.js"></script>');
  }
  if (!next.includes('/shared/quality-telemetry.js')) {
    lines.push('<script src="/shared/quality-telemetry.js"></script>');
  }
  if (!next.includes('/shared/pwa-runtime.js')) {
    lines.push('<script src="/shared/pwa-runtime.js"></script>');
  }
  if (!next.includes('/shared/device-quality-runtime.js')) {
    lines.push('<script src="/shared/device-quality-runtime.js"></script>');
  }
  if (!next.includes('/shared/graphics-quality-controller.js')) {
    lines.push('<script src="/shared/graphics-quality-controller.js"></script>');
  }
  if (!next.includes('/shared/frame-stutter-profiler.js')) {
    lines.push('<script src="/shared/frame-stutter-profiler.js"></script>');
  }
  if (!next.includes('/shared/predictive-streaming-runtime.js')) {
    lines.push('<script src="/shared/predictive-streaming-runtime.js"></script>');
  }
  if (!next.includes('/shared/asset-delivery-runtime.js')) {
    lines.push('<script src="/shared/asset-delivery-runtime.js"></script>');
  }
  if (!next.includes('/shared/animation-quality-validator.js')) {
    lines.push('<script src="/shared/animation-quality-validator.js"></script>');
  }
  if (!next.includes('/shared/rig-adapters.js')) {
    lines.push('<script src="/shared/rig-adapters.js"></script>');
  }

  lines.push(END);
  const block = `\n${lines.join('\n')}\n`;

  if (!/<\/head>/i.test(next)) {
    throw new Error(`HTML has no </head> for ${appId}`);
  }
  return next.replace(/<\/head>/i, `${block}</head>`);
}

function appIdFromFile(file) {
  const relative = path.relative(APPS_ROOT, file);
  const parts = relative.split(path.sep);
  return parts.length > 1 ? parts[0] : null;
}

function injectHtmlForPath(html, file) {
  const appId = appIdFromFile(file);
  if (!appId) return html;
  return injectHtml(html, appOptions(appId));
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

function shouldSkip(file) {
  const relative = path.relative(APPS_ROOT, file);
  const parts = relative.split(path.sep).map(part => part.toLowerCase());
  return path.basename(file).toLowerCase().includes('baseline') || parts.includes('assets');
}

function main() {
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of walk(APPS_ROOT)) {
    const relative = path.relative(ROOT, file).replaceAll('\\', '/');
    if (shouldSkip(file)) {
      skipped++;
      continue;
    }

    try {
      const before = fs.readFileSync(file, 'utf8');
      const after = injectHtmlForPath(before, file);
      if (before === after) {
        unchanged++;
        continue;
      }
      fs.writeFileSync(file, after, 'utf8');
      changed++;
      console.log(`[PWA_INJECT] ${relative}`);
    } catch (error) {
      failed++;
      console.error(`[PWA_INJECT] FAIL ${relative}: ${error.message}`);
    }
  }

  console.log(`[PWA_INJECT] changed=${changed} unchanged=${unchanged} skipped=${skipped} failed=${failed}`);
  if (failed) process.exit(41);
}

module.exports = {
  START,
  END,
  appOptions,
  ensureViewportFit,
  injectHtml,
  injectHtmlForPath,
  shouldSkip
};

if (require.main === module) main();
