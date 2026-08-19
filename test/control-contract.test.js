'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const catalog = read('apps/catalog/client.js');
const survival = read('apps/survival/client.js');
const voxel = read('apps/voxel-world/client.js');
const voxelHtml = read('apps/voxel-world/index.html');
const sharabass = read('apps/world-sharabass/index.html');

test('every 3D game maps WASD and arrows to the same four directions', () => {
  for (const source of [catalog, survival, voxel]) {
    assert.match(source, /keyDown\('KeyW','ArrowUp'\)/);
    assert.match(source, /keyDown\('KeyS','ArrowDown'\)/);
    assert.match(source, /keyDown\('KeyA','ArrowLeft'\)/);
    assert.match(source, /keyDown\('KeyD','ArrowRight'\)/);
  }
  assert.match(survival, /keyDown\('KeyA','ArrowLeft'\)\) move\.sub\(right\)/);
  assert.match(survival, /keyDown\('KeyD','ArrowRight'\)\) move\.add\(right\)/);
  assert.match(sharabass, /keys\.has\('KeyW'\) \|\| keys\.has\('ArrowUp'\)/);
  assert.match(sharabass, /keys\.has\('KeyA'\) \|\| keys\.has\('ArrowLeft'\)/);
  assert.match(sharabass, /keys\.has\('KeyD'\) \|\| keys\.has\('ArrowRight'\)/);
});

test('voxel joystick has camera-relative forward and strafe axes', () => {
  const source = voxel.match(/function joystickVector\(dx,dy,radius=46\)\{[^}]+\};\}/)?.[0];
  assert.ok(source, 'joystickVector helper is missing');
  const context = { Math };
  vm.runInNewContext(`${source};this.joystickVector=joystickVector`, context);
  assert.deepEqual({ ...context.joystickVector(0, -46) }, { forward: 1, strafe: 0 });
  assert.deepEqual({ ...context.joystickVector(0, 46) }, { forward: -1, strafe: 0 });
  assert.deepEqual({ ...context.joystickVector(-46, 0) }, { forward: 0, strafe: -1 });
  assert.deepEqual({ ...context.joystickVector(46, 0) }, { forward: 0, strafe: 1 });
});

test('voxel mobile controls use immediate pointer input and full-canvas look', () => {
  assert.match(voxel, /look=renderer\.domElement/);
  assert.match(voxel, /bind\('jumpBtn',requestJump\)/);
  assert.match(voxel, /addEventListener\('pointerdown'/);
  assert.match(voxel, /jumpQueuedUntil=performance\.now\(\)\+300/);
  assert.match(voxel, /player\.pitch=clamp\([^;]+,-1\.52,1\.52\)/);
  assert.match(voxel, /requestFullscreen\|\|root\.webkitRequestFullscreen/);
  assert.match(voxelHtml, /id="fullscreenBtn"/);
  assert.match(voxelHtml, /height:100dvh/);
  assert.match(voxelHtml, /\.lookZone\{display:none\}/);
});

test('mouse and touchpad look remains available in every 3D game', () => {
  assert.match(catalog, /document\.pointerLockElement/);
  assert.match(survival, /document\.pointerLockElement/);
  assert.match(voxel, /dragLook/);
  assert.match(sharabass, /charPitch = Math\.max\(-1\.35, Math\.min\(0\.65/);
});
