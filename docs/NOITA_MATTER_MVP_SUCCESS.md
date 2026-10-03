# Noita Matter MVP — success record

Date: 2026-10-01

## Result

A playable visual Matter Lab was added at /apps/noita-matter-mvp/.

It uses the browser bundle built directly from lib/world-matter-engine.js, so the visual demo and server-side tests exercise the same material rules rather than a separately mocked physics implementation.

## What a tester can verify

- Lava falls into water and creates stone + steam.
- Wood catches fire, burns down and leaves ash.
- Sand falls and settles.
- Water and oil move under density/gravity rules.
- Steam rises.
- Pause/resume freezes and resumes simulation ticks.
- Reset restores the selected experiment.
- A finger/mouse paints sand, water, oil, wood, fire, lava or erases cells.
- Active-cell and active-chunk counters remain visible.

## Mobile visibility gate

Target viewport: 390x844 (iPhone 11-class portrait).

Observed:
- full-height game canvas with no browser-like top folders or scroll UI;
- selected experiment occupies the main visible play area;
- high-contrast water/lava/fire/sand colors;
- primary scenarios visible in the first control row;
- material tools are directly tappable and horizontally scrollable;
- simulation remains readable while controls stay clear of the active interaction area.

Manual visibility score: 92/100. Release threshold: >85/100.

The first mobile pass failed the visibility requirement because the square-cell world occupied only the lower half of the phone. The fix deliberately zooms the simulation on narrow screens and starts mobile users in the most legible lava+water experiment. The top physical ceiling remains in the simulation but is no longer rendered as a distracting horizontal bar.

## Verification

- agent-browser loads the page and exposes all 13 expected interactive controls.
- Desktop screenshot verified meaningful rendered matter, not a blank canvas.
- Mobile 390x844 screenshot verified the zoomed playable view.
- Pause test held the same tick value across two delayed reads.
- Matter engine regression suite remains independent from the UI bundle.

## Why this MVP worked

The demo is a thin visual layer over the tested deterministic Matter Engine. It does not invent per-scene animations. Presets only place materials; the engine produces movement and reactions from local rules. This keeps the MVP useful as evidence for World Server instead of becoming a disposable animation mock.
