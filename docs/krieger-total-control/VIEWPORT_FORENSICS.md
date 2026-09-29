# Viewport Forensics Mode

Portrait must be solved as a measured render-pipeline problem, not a CSS problem.

## Required measurements

A forensic run records these independent layers:

1. physical/browser screen and orientation;
2. CSS viewport and `visualViewport`;
3. devicePixelRatio;
4. canvas CSS rectangle;
5. canvas backing-buffer dimensions;
6. engine `ConfigX/ConfigY` and screen dimensions;
7. `mainplayer.cpp` master viewport;
8. projection aspect;
9. IPP viewport before and after fractional crop;
10. render-target size class;
11. actual WebGL viewport;
12. final backbuffer/frame lifecycle.

A full canvas is **not** evidence of a full 3D scene.

## Current measured-source hypothesis

Pinned source currently does this in the linked Krieger player:

- calculates the largest centered 2:1 rectangle from `ConfigX/ConfigY`;
- assigns it to the master viewport;
- sets `Environment->Aspect = 2.0f`.

If an iPhone backing buffer is 1170×2532, a 2:1 policy can still deliberately select a shallow centered scene area. Forensics identifies `mainplayer.master_viewport` as the first mismatch if this is what happens at runtime.

No responsive fix should be merged before this telemetry proves the actual stage chain.

## Aspect-ratio torture matrix

`aspect-torture.mjs` runs:

- 1280×720 — 16:9;
- 844×390 — approximately 19.5:9 landscape;
- 1024×768 — 4:3;
- 800×800 — 1:1;
- 450×800 — 9:16;
- 320×900 — narrow portrait.

Diagnostic mode verifies telemetry and localizes the known policy. It does **not** fail merely because the old renderer is still 2:1.

Set `KK_REQUIRE_RESPONSIVE=1` after implementing a real responsive renderer policy. Then the same test becomes an acceptance gate and fails if portrait still resolves to the 2:1 band.

## START forensics

The browser records runtime initialization, pointerdown, click, fullscreen request/result, `callMain` begin/return and browser viewport snapshots. A START fix is accepted only if one ready-state gesture has a complete causal chain. A headless click by itself is insufficient.

## USE / weapon forensics

The C++ game records:

- requested digit/key;
- `weaponswap` result;
- whether `Player.Weapon[mapped]` is owned;
- `CurrentWeapon`;
- `NextWeapon`;
- `WeaponTimer`;
- request acceptance;
- actual CurrentWeapon commit.

This makes a browser label that says W2 while the engine stayed on W1 immediately visible as state divergence.
