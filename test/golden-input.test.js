'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Golden input normalizes mobile WebKit key-only keyboard events', () => {
  const listeners = new Map();
  const addEventListener = (type, listener) => {
    const items = listeners.get(type) || [];
    items.push(listener);
    listeners.set(type, items);
  };
  const window = { dispatchEvent() {} };
  const context = {
    window,
    addEventListener,
    document: {
      addEventListener,
      readyState: 'complete',
      getElementById() { return null; }
    },
    matchMedia() { return { matches: false }; },
    KeyboardEvent: class KeyboardEvent {},
    CustomEvent: class CustomEvent {},
    Date,
    Math,
    Set
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'ai3d-playable-runtime.js'), 'utf8'), context);

  assert.equal(window.GameGoldenStandard.normalizeCode({ code: '', key: 'w' }), 'KeyW');
  assert.equal(window.GameGoldenStandard.normalizeCode({ code: '', key: 'ArrowUp' }), 'ArrowUp');
  assert.equal(window.GameGoldenStandard.normalizeCode({ code: '', key: ' ' }), 'Space');

  for (const listener of listeners.get('keydown')) listener({ code: '', key: 'w', preventDefault() {} });
  assert.equal(window.GameGoldenStandard.input().forward, true);
  for (const listener of listeners.get('keyup')) listener({ code: '', key: 'w', preventDefault() {} });
  assert.equal(window.GameGoldenStandard.input().forward, false);
});
