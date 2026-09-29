# Krieger portrait fullscreen — solved and user-confirmed

Status: **SOLVED / USER-CONFIRMED ON PHYSICAL iPhone**
Date: 2026-09-29

Canonical implementation and complete proof:
https://github.com/mpaykin1/scratch-chain-reaction/blob/main/KRIEGER_PORTRAIT_FULLSCREEN_PROOF.md

Public proof:
https://mpaykin1.github.io/scratch-chain-reaction/kkrieger-portrait-proof/

## Root cause

The problem was inside the Krieger render policy, not primarily in CSS.

In the pinned browser port, `mainplayer.cpp` forced the largest centered 2:1 master viewport:

```cpp
sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
sInt bw = 2*bh;
vp.Window.Init(x0,y0,x0+bw,y0+bh);
```

and also forced:

```cpp
Environment->Aspect = 2.0f;
```

The full-size render-target/postprocess path in `genoverlay.cpp` also inherited a 2:1 assumption.

That is why a full-height browser canvas could still contain a narrow horizontal 3D scene.

## Proven engine-level fix

For portrait:

- master viewport = full `ConfigX × ConfigY`;
- projection aspect = actual master viewport width / height;
- full-size postprocess/render target can allocate for portrait dimensions;
- browser canvas remains full viewport, but canvas geometry alone is never used as proof;
- landscape preserves the original 2:1 Krieger composition.

## Proof evidence

The public proof passed both pre-publication and live GitHub Pages tests:

- browser viewport: 390×844
- engine/backing buffer: 1170×2532
- master viewport: 1170×2532
- projection aspect: 0.46208531
- requested full-size RT: 1170×2532
- allocated RT: 2048×4096
- real textured scene height coverage: 100%
- public exact-bytes verification: PASS
- public live portrait re-test: PASS

The user then opened the public proof on the physical iPhone and explicitly confirmed that the portrait fullscreen solution works.

## World Server rule

Future aspect-ratio/fullscreen work must inspect the entire chain:

```text
screen
→ CSS / visual viewport
→ canvas CSS size
→ canvas backing buffer
→ engine ConfigX / ConfigY
→ master viewport
→ projection aspect
→ render-target dimensions
→ postprocess viewport
→ WebGL viewport
→ final framebuffer
→ real textured scene coverage
```

The first divergent stage is the bug location.

Never again treat `canvas == viewport` as proof that the 3D scene fills the screen.

## Capability extraction

- fixed Krieger 2:1 viewport policy: **KRIEGER-ONLY**
- responsive viewport policy: **REIMPLEMENT as World Server policy**
- viewport forensics: **REUSE**
- aspect-ratio torture test: **REUSE**
- real textured-scene coverage gate: **REUSE**

## Separate mobile issues

Portrait fullscreen is solved.

Do not conflate it with the remaining main-game problems:
- USE must switch the actual engine weapon state reliably;
- START GAME must become deterministic from one ready-state gesture.
