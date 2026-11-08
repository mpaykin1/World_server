#!/usr/bin/env python3
"""A reproducible same-run browser probe; SwiftShader is not a real iPhone GPU.

Collects frame intervals in live Three.js game at fixed seed / viewport and
render scale. Does not issue user PASS/FAIL or infer real device FPS.
"""
import asyncio
import json
import os
import statistics
import sys

from lib.harness import Game


async def measure():
    viewport = (int(os.environ.get("GRAPHICS_WIDTH", "960")),
                int(os.environ.get("GRAPHICS_HEIGHT", "540")))
    variant = os.environ.get("GRAPHICS_VARIANT", "candidate")
    output_dir = os.environ.get("GRAPHICS_OUTPUT_DIR", os.getcwd())
    os.makedirs(output_dir, exist_ok=True)
    async with Game(viewport=viewport) as g:
        await g.title()
        await g.js("window.__isle.rebuild(1337, 'dusk')")
        await g.js("window.__isle.startGame()")
        await g.frames(18)  # compile shader / warm effects and atlas
        data = await g.js("""async () => {
          const I = window.__isle, deltas = [];
          const start = performance.now();
          let previous = 0;
          await new Promise(resolve => {
            const frame = now => {
              if (previous) deltas.push(now - previous);
              previous = now;
              if (deltas.length >= 60) resolve(); else requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
          });
          return {
            count: deltas.length,
            frame_intervals_ms: deltas.map(x => +x.toFixed(3)),
            elapsed_ms: +(performance.now() - start).toFixed(3),
            resolution_scale: I.perf.scale,
            game_state: I.G.state
          };
        }""")
        await g.shot(os.path.join(output_dir, variant + ".png"))
        issues = g.problems()
        if issues:
            raise RuntimeError("Browser produced errors: " + repr(issues[:3])[:700])
    values = sorted(data.pop("frame_intervals_ms"))
    def pct(p):
        return round(values[min(len(values) - 1, int(p * (len(values) - 1)))], 3)
    data.update(
        variant=variant, viewport=list(viewport), renderer="Chromium SwiftShader (software)",
        frame_median_ms=round(statistics.median(values), 3),
        frame_p95_ms=pct(.95), frame_p99_ms=pct(.99),
        observed_fps=round(1000 / statistics.mean(values), 2),
        physical_mobile_verified=False, visual_reference_score=None, user_verdict="PENDING",
    )
    with open(os.path.join(output_dir, variant + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(json.dumps(data))
    if data["count"] != 60 or data["game_state"] != "play":
        raise RuntimeError("Missing actual game render frames")


if __name__ == "__main__":
    try:
        asyncio.run(measure())
    except Exception as exc:
        print("RENDER_PROBE_FAILED:", str(exc)[:750], file=sys.stderr)
        sys.exit(1)
