const assert = require("node:assert/strict");
const test = require("node:test");
const { CSS_TEXT, install, viewportHeight } = require("../shared/fixed-game-viewport.js");

function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    emit(type, event = {}) {
      for (const fn of listeners.get(type) || []) fn(event);
    }
  };
}

function fixture() {
  const winEvents = target();
  const vvEvents = target();
  const docEvents = target();
  const vars = new Map();
  const documentElement = {
    clientHeight: 844,
    scrollHeight: 844,
    scrollTop: 0,
    style: { setProperty(k, v) { vars.set(k, v); } },
    appendChild() {}
  };
  const body = { scrollHeight: 844, scrollTop: 0 };
  const head = { appendChild(node) { this.node = node; } };
  const document = {
    ...docEvents,
    documentElement,
    body,
    head,
    getElementById() { return null; },
    createElement() { return { id: "", textContent: "" }; }
  };
  const window = {
    ...winEvents,
    innerHeight: 844,
    scrollX: 0,
    scrollY: 0,
    visualViewport: { ...vvEvents, height: 820 },
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; }
  };
  return { window, document, vars, vvEvents };
}

test("CSS hard-locks document and game surface", () => {
  for (const token of [
    "position:fixed!important",
    "overflow:hidden!important",
    "overscroll-behavior:none!important",
    "touch-action:none!important",
    "[data-world-game-root]",
    "[data-world-game-canvas]"
  ]) assert.ok(CSS_TEXT.includes(token), token);
});

test("viewportHeight prefers visualViewport", () => {
  const { window, document } = fixture();
  assert.equal(viewportHeight(window, document), 820);
});

test("install locks height and forces scroll back to zero", () => {
  const { window, document, vars, vvEvents } = fixture();
  window.scrollY = 240;
  const lock = install({ window, document });
  assert.equal(vars.get("--ws-game-h"), "820px");
  assert.equal(window.scrollY, 0);
  assert.equal(lock.snapshot().height, 820);

  window.visualViewport.height = 760;
  vvEvents.emit("resize");
  assert.equal(vars.get("--ws-game-h"), "760px");

  let prevented = false;
  document.emit("touchmove", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  lock.destroy();
});
