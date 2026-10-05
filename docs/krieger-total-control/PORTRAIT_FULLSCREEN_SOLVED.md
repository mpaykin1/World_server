# Krieger portrait fullscreen — solved knowledge for World Server

Status: **SOLVED / USER-CONFIRMED ON PHYSICAL iPhone**
Date: 2026-09-29

Canonical proof implementation:
https://github.com/mpaykin1/scratch-chain-reaction/blob/main/KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md

Public proof:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

## Root cause

The Krieger WASM player did not merely inherit a browser/CSS aspect ratio.

The render policy itself forced a centered 2:1 master viewport in `mainplayer.cpp`:

```cpp
sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
sInt bw = 2*bh;
...
vp.Window.Init(x0,y0,x0+bw,y0+bh);
```

and then forced:

```cpp
Environment->Aspect = 2.0f;
```

The full-size render-target/postprocess path in `genoverlay.cpp` also carried a 2:1 assumption.

Therefore a portrait canvas could physically fill the phone while the actual 3D scene still occupied only a shallow horizontal band.

## Proven fix

For portrait:

1. set the master viewport to the whole engine surface:
   `0,0,ConfigX,ConfigY`;
2. set projection aspect to actual viewport width / height;
3. let the full-size postprocess/render target allocate for portrait dimensions;
4. keep CSS canvas full-viewport, but never use canvas size alone as proof;
5. preserve the original Krieger 2:1 landscape composition.

## Live proof measurements

The public proof passed with:

- browser viewport: 390×844
- engine backing surface: 1170×2532
- engine config: 1170×2532
- master viewport: 1170×2532
- projection aspect: 0.46208531
- requested full-size RT: 1170×2532
- allocated RT: 2048×4096
- textured scene height coverage: 100%
- exact published bytes: PASS
- public live portrait re-test: PASS

The user then opened the public proof on the real iPhone and explicitly confirmed that it works.

## World Server rule

Any future aspect-ratio/fullscreen implementation that inherits Krieger technology must observe:

```text
screen
→ CSS viewport
→ canvas CSS
→ canvas backing buffer
→ ConfigX/ConfigY
→ master viewport
→ projection aspect
→ render-target dimensions
→ postprocess viewport
→ GL viewport
→ final framebuffer
→ real textured scene coverage
```

The first stage that diverges is the bug location.

Do not fix portrait by stretching CSS around an internal 2:1 render policy.

## Extraction classification

- fixed 2:1 Krieger viewport policy: **KRIEGER-ONLY**
- responsive viewport policy learned from this work: **REIMPLEMENT / REUSE as World Server policy**
- viewport forensics instrumentation: **REUSE**
- aspect-ratio torture matrix: **REUSE**
- textured-scene coverage acceptance: **REUSE**

## Still open in the main mobile Krieger game

This portrait knowledge is solved and reusable.

Separate bugs remain:
- USE must switch the real engine weapon state reliably;
- START GAME must become deterministic from one ready-state gesture.

Those must not be conflated with portrait fullscreen again.
