# World Server Game Viewport Lock

**Status:** mandatory release contract for browser games.

## Invariant

A game owns the browser viewport. A finger gesture may change game input, camera, world or joystick state, but must never scroll, bounce or stretch the document.

The shared implementation is:

- `shared/world-server-game-viewport.css`
- `shared/world-server-game-viewport.js`
- `scripts/inject-game-viewport-lock.js`
- `scripts/game-viewport-lock-gate.js`
- `e2e/game-viewport-lock.spec.js`

New `apps/<game>/index.html` pages are protected by default. Non-game tools must be explicitly listed in `EXEMPT_APPS`; exemption is exceptional, not the default.

## Owned resize chain

`VisualViewport -> game root -> canvas CSS size -> canvas backing buffer x DPR -> WebGL viewport -> camera aspect -> registered render targets -> HUD CSS variables`.

Engines with private renderer/camera objects should register an adapter:

```js
WorldServerGameViewport.registerAdapter({
  camera,
  renderTargets:[postFxTarget],
  onResize({cssWidth,cssHeight,dpr}) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssWidth,cssHeight,false);
  }
});
```

The page itself never scrolls. A long modal may opt into isolated scrolling with `data-world-server-scroll`.

## Release gate

`npm run viewport:check` is part of `release:gate`. Vercel build injects the shell into every game entrypoint. CI additionally runs the WebKit iPhone-emulation regression:

- document scroll remains 0;
- game pointer input is non-zero;
- overflow is hidden;
- gameplay touch-action is none;
- canvas backing buffer and WebGL drawing buffer stay synchronized.

A browser game with page movement is RELEASE FAIL.

CI also runs the mobile Chromium profile with native touch input through the
browser protocol. The same swipe must scroll an unlocked control page before
the locked-game assertions can pass; trusted touch input must reach the game
while document movement stays zero. DOM-dispatched events separately test
listener cancellation and are not evidence of native scrolling. Native UI click
and tap regressions cover bootstrap before a canvas appears and after it becomes
the active surface. These browser checks do not replace physical iPhone evidence.

## Physical iPhone evidence

Synthetic WebKit is necessary but not sufficient for Safari edge cases. The real-device request includes the `game-viewport-lock` contract. A verified mobile release should run `REAL_DEVICE_STRICT=1 npm run quality:real-devices` and retain provider evidence for a physical iOS phone.
