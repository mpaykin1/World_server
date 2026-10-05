# Krieger Total Control

This program turns the pinned real .kkrieger / werkkzeug3 browser port into an evidence-backed technology donor and laboratory for World Server.

It is deliberately **not** another visual remake and **not** a document-only archaeology exercise. Every important claim must be anchored to the pinned source and every difficult runtime claim must be measurable through the Observatory/Forensics bus.

## Canonical target

Pinned source: `MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242`.

Two required provenance chains:

`DATA → GENERATOR → RUNTIME OBJECT → CPU JOB → GPU BUFFER → MATERIAL/SHADER → FRAMEBUFFER → POSTPROCESS → VIEWPORT → CANVAS`

`INPUT → browser/SDL event → WASM input buffer → app handler → game state → simulation → animation/event → renderer`

## What exists in this first executable slice

- `data/krieger-knowledge-graph.json`: ten canonical technology maps with exact pinned-source anchors.
- `data/krieger-capability-map.json`: World Server extraction decisions using only REUSE / ADAPT / REIMPLEMENT / KRIEGER-ONLY / OBSOLETE.
- `data/krieger-labs.json`: Laboratory contracts; Viewport Lab is executable, Weapon/Lifecycle have working Observatory telemetry, the remaining labs are explicit scaffolds.
- `verify-upstream.mjs`: fails if a mapped source anchor disappears at the pinned SHA.
- `patch-forensics.py`: instrumentation-only patch. It must not alter renderer/game policy.
- `observatory-core.mjs`: interprets runtime evidence without equating DOM state with engine state.
- `aspect-torture.mjs`: real browser/WASM torture matrix for 16:9, 19.5:9, 4:3, 1:1, 9:16 and narrow portrait.
- CI builds the real instrumented C++ game with Emscripten and uploads the telemetry report/screenshots.

## First high-value finding

The current WASM port has a source-level portrait constraint in `mainplayer.cpp`. During every paint frame it chooses the largest centered **2:1** rectangle:

```cpp
sInt bh = sMin(sSystem->ConfigX/2,sSystem->ConfigY);
sInt bw = 2*bh;
...
vp.Window.Init(x0,y0,x0+bw,y0+bh);
```

and later sets:

```cpp
Environment->Aspect = 2.0f;
```

This occurs upstream of the postprocess fixes previously attempted in `genoverlay.cpp`. It is therefore a concrete, source-verified explanation candidate for why a full-height canvas can still contain a horizontal gameplay band. Total Control measures this path before changing it.

## Physical-device truth rule

The user's real iPhone report outranks synthetic Chromium PASS. The three existing mobile bugs remain open until physical-device confirmation:

- actual weapon does not reliably change when USE/UI says it did;
- START can require repeated taps;
- portrait scene still does not truly fill the gameplay screen.

Automated evidence is useful for localization, not permission to declare those three fixed.

## Agent Zero

Agent Zero was invoked as a read-only independent reviewer. Its first pass explicitly refused to invent missing upstream symbol evidence when exact bodies were unavailable in its local context. That limitation is intentional evidence: Total Control therefore relies on a machine-verifiable pinned-source graph instead of filename inference. Agent Zero remains a review lane, not a second writer racing the implementation branch.

## Next extraction steps

The Observatory grows channels for geometry, material passes, draw jobs, lights, sectors/portals, collision and skeletons. Labs then isolate one generator at a time. Only after evidence is sufficient is a capability promoted into the World Server procedural core.
