'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Isolated behavioral test: evaluates only the actual touch declaration and blur callback.
const source = fs.readFileSync(path.join(__dirname, '../games/ostrov-sumerek/engine/37_input.js'), 'utf8');
const touchDeclaration = source.match(/^const touch = \{[^\n]+\};$/m);
const blurListener = source.match(/^addEventListener\('blur', \(\) => \{[^\n]+\}\);$/m);
assert.ok(touchDeclaration, 'touch state declaration must exist');
assert.ok(blurListener, 'window blur listener must exist');

function makeInput() {
  const listeners = new Map();
  const ctx = {
    addEventListener: (event, callback) => listeners.set(event, callback),
    keys: new Set(['KeyW']),
    onJumpRelease: () => { ctx.jumpHeld = false; },
    releaseAll: () => { ctx.attackHeld = false; },
    mouseMask: 1,
    drag: { active: true },
    jumpHeld: true,
    attackHeld: true,
  };
  vm.runInNewContext(touchDeclaration[0] + '\n' + blurListener[0] + '\nglobalThis.qaTouch = touch;', ctx, { timeout: 1000 });
  return { ctx, touch: ctx.qaTouch, blur: listeners.get('blur') };
}

test('focus loss releases keyboard, attack, jump and mouse drag', () => {
  const { ctx, blur } = makeInput();
  blur();
  assert.equal(ctx.keys.size, 0);
  assert.equal(ctx.jumpHeld, false);
  assert.equal(ctx.attackHeld, false);
  assert.equal(ctx.drag.active, false);
  assert.equal(ctx.mouseMask, 0);
});

test('focus loss releases both touch pointers and neutralizes virtual joystick', () => {
  const { touch, blur } = makeInput();
  Object.assign(touch, { stickId: 7, camId: 8, vx: 0.9, vy: -0.6 });
  blur();
  assert.equal(touch.stickId, null, 'stale stick pointer blocks new touch capture');
  assert.equal(touch.camId, null, 'stale camera pointer blocks new touch capture');
  assert.equal(touch.vx, 0, 'stale movement persists after focus loss');
  assert.equal(touch.vy, 0, 'stale movement persists after focus loss');
});
