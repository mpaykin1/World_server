'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'shared/world-emergence-board.css'), 'utf8');
const demo = fs.readFileSync(path.join(root, 'shared/world-stack-autodemo.mjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'apps/voxel-world/index.html'), 'utf8');

test('live game loads board styles and the board stays above interactive demo', () => {
  assert.match(html, /<link rel="stylesheet" href="\/shared\/world-emergence-board\.css">/);
  const launcher = Number(css.match(/#vwWorldBoardOpen\{[^}]*z-index:(\d+)/)?.[1]);
  const backdrop = Number(css.match(/#vwWorldBoardBackdrop\{[^}]*z-index:(\d+)/)?.[1]);
  const demoLevel = Number(demo.match(/z-index:(\d+);width:min\(720px/)?.[1]);
  assert.ok(Number.isFinite(demoLevel) && launcher > demoLevel);
  assert.ok(backdrop > launcher && backdrop > 110);
});
