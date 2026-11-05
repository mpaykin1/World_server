#!/usr/bin/env python3
"""Collect local Chromium/Three.js fixture evidence without a server or downloads."""
import argparse
import asyncio
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from playwright.async_api import async_playwright


ORIGIN = "https://graf-evidence.invalid"
FIXTURE = """<!doctype html><meta charset="utf-8"><title>GRAF local frame fixture</title>
<link rel="icon" href="data:,">
<style>html,body{margin:0;background:#020408;overflow:hidden}canvas{display:block}</style>
<script src="/frame-metrics.js"></script>"""

BROWSER_MEASURE = r"""async ({frames, warmup}) => {
  const THREE = await import('/three.module.js');
  if (THREE.REVISION !== '160') throw new Error('Expected Three.js revision 160');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const renderer = new THREE.WebGLRenderer({antialias: false, preserveDrawingBuffer: true});
  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x020408);
  document.body.appendChild(renderer.domElement);
  let contextLost = false;
  renderer.domElement.addEventListener('webglcontextlost', () => { contextLost = true; });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(3, 2.5, 4);
  camera.position.multiplyScalar(Math.max(1, 0.9 / camera.aspect));
  camera.lookAt(0, 0, 0);
  const colors = [0xff3333, 0xff3333, 0x33ff33, 0x33ff33, 0x3333ff, 0x3333ff];
  // Shared material groups merge to one draw call only with one material.
  // Vertex colors preserve visible RGB faces while keeping the box at one draw.
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const vertexColors = [];
  for (const hex of colors) {
    const color = new THREE.Color(hex);
    for (let vertex = 0; vertex < 4; vertex++) vertexColors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertexColors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({vertexColors: true}));
  scene.add(mesh);
  const gl = renderer.getContext();
  const originalAutoReset = renderer.info.autoReset;
  const counters = () => {
    const {calls, triangles, lines, points} = renderer.info.render;
    return {calls, triangles, lines, points};
  };
  const draws = {};
  const collector = GRAFFrameMetrics.createFrameMetrics({capacity: frames, targetFps: 60});
  const overhead = [];
  const drawFrame = () => {
    renderer.info.reset();
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    const count = counters();
    assert(count.calls === 2 && count.triangles === 24, 'Two-pass frame counters differ');
    return count;
  };
  try {
    renderer.info.autoReset = true;
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    draws.lastPassAutoReset = counters();
    assert(draws.lastPassAutoReset.calls === 1 && draws.lastPassAutoReset.triangles === 12,
      'autoReset=true must expose only the last pass');
    renderer.info.autoReset = false;
    draws.aggregatedFrame = drawFrame();
    let seen = 0;
    await new Promise((resolve, reject) => {
      let raf = null;
      const deadline = setTimeout(() => {
        if (raf !== null) cancelAnimationFrame(raf);
        reject(new Error('RAF fixture exceeded 20 second deadline'));
      }, 20000);
      const tick = timestamp => {
        try {
          const count = drawFrame();
          if (seen >= warmup) {
            const before = performance.now();
            const accepted = collector.recordFrame(timestamp, count);
            overhead.push(performance.now() - before);
            assert(accepted === (seen > warmup), 'Unexpected timestamp acceptance');
          }
          seen++;
          if (seen === warmup + frames + 1) {
            clearTimeout(deadline);
            resolve();
          } else raf = requestAnimationFrame(tick);
        } catch (error) {
          clearTimeout(deadline);
          reject(error);
        }
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    renderer.info.autoReset = originalAutoReset;
  }
  const snapshot = collector.snapshot({includeSamples: true});
  assert(snapshot.sampleCount === frames && snapshot.rawSamples.length === frames,
    'Metric sample coverage differs');
  const rawTimes = snapshot.rawSamples.map(row => row.frameMs).sort((a, b) => a - b);
  const elapsedMs = rawTimes.reduce((sum, value) => sum + value, 0);
  assert(Math.abs(snapshot.fps - frames * 1000 / elapsedMs) < 1e-8, 'FPS calculation differs');
  assert(snapshot.frameTimeMs.p95 === rawTimes[Math.ceil(frames * 0.95) - 1],
    'Raw nearest-rank frame p95 differs');
  for (const [metric, expected] of [['drawCalls', 2], ['triangles', 24], ['lines', 0], ['points', 0]]) {
    const summary = snapshot[metric];
    assert(summary.sampleCount === frames && summary.mean === expected &&
      summary.p95 === expected && summary.max === expected, `${metric} coverage/totals differ`);
  }
  assert(snapshot.rawSamples.every(row => row.calls === 2 && row.triangles === 24),
    'Raw per-frame counters differ');
  assert(!contextLost && !gl.isContextLost(), 'WebGL context was lost');
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const pixelProbe = {sampledPixels: width * height, nonBackground: 0, red: 0, green: 0, blue: 0};
  for (let index = 0; index < pixels.length; index += 4) {
    const [red, green, blue] = pixels.subarray(index, index + 3);
    if (Math.max(red, green, blue) > 40) pixelProbe.nonBackground++;
    if (red > green + 30 && red > blue + 30) pixelProbe.red++;
    if (green > red + 30 && green > blue + 30) pixelProbe.green++;
    if (blue > red + 30 && blue > green + 30) pixelProbe.blue++;
  }
  assert(pixelProbe.nonBackground > 100 && pixelProbe.red > 30 &&
    pixelProbe.green > 30 && pixelProbe.blue > 30, 'Canvas lacks visible RGB box faces');
  const glError = gl.getError();
  assert(glError === gl.NO_ERROR, `WebGL error ${glError}`);
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  overhead.sort((a, b) => a - b);
  return {
    snapshot, draws, pixelProbe,
    recordFrameCpuMs: {sampleCount: overhead.length,
      mean: overhead.reduce((sum, value) => sum + value, 0) / overhead.length,
      p95: overhead[Math.ceil(overhead.length * 0.95) - 1]},
    environment: {
      userAgent: navigator.userAgent, threeRevision: THREE.REVISION,
      viewport: {width: innerWidth, height: innerHeight, devicePixelRatio},
      drawingBuffer: {width, height}, webglVersion: gl.getParameter(gl.VERSION),
      vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      contextLost, glError, autoResetRestored: renderer.info.autoReset === originalAutoReset
    }
  };
}"""


def viewport(value):
    try:
        width, height = (int(part) for part in value.lower().replace("x", ",").split(","))
        if not (64 <= width <= 4096 and 64 <= height <= 4096):
            raise ValueError()
        return {"width": width, "height": height}
    except ValueError as error:
        raise argparse.ArgumentTypeError("viewport must be WIDTHxHEIGHT, each 64..4096") from error


async def measure(args):
    collector = Path(__file__).resolve().parents[1] / "shared/graphics/frame-metrics.js"
    sources = {"/three.module.js": args.three_module.read_bytes(),
               "/frame-metrics.js": collector.read_bytes(), "/": FIXTURE.encode()}
    errors, blocked_requests = [], []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            executable_path=args.chromium, headless=True,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl"])
        context = await browser.new_context(viewport=args.viewport, device_scale_factor=args.dpr,
                                            service_workers="block")

        async def route_local(route):
            request = route.request
            path = request.url.removeprefix(ORIGIN)
            if request.url.startswith(ORIGIN + "/") and path in sources:
                await route.fulfill(status=200, body=sources[path],
                                    content_type="text/html" if path == "/" else "text/javascript")
            else:
                blocked_requests.append(request.url)
                await route.abort()

        await context.route("**/*", route_local)
        page = await context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        try:
            await page.goto(ORIGIN + "/", wait_until="load", timeout=10000)
            result = await asyncio.wait_for(page.evaluate(BROWSER_MEASURE, {
                "frames": args.frames, "warmup": 10}), timeout=25)
            if errors or blocked_requests:
                raise RuntimeError(f"Browser errors={errors!r}; blocked unexpected requests={blocked_requests!r}")
            if args.screenshot:
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(args.screenshot), timeout=10000)
            result.update({
                "schema": "graf-local-browser-evidence", "version": 1,
                "recordedAt": datetime.now(timezone.utc).isoformat(),
                "mode": "local-browser-fixture", "gameBenchmark": False,
                "physicalMobileVerified": False, "userVerdict": "PENDING",
                "warmupFrames": 10, "browserVersion": browser.version,
                "browserErrors": errors, "unexpectedRequests": blocked_requests,
                "renderingBackendRequested": "ANGLE SwiftShader (software rendering)",
                "sourceSha256": {path.lstrip("/"): hashlib.sha256(body).hexdigest()
                                 for path, body in sources.items() if path != "/"},
                "limitations": ["Synthetic RGB box; not game performance or a visual acceptance verdict.",
                                "Software-rendered headless Chromium; viewport size is not a physical device.",
                                "recordFrame CPU timing includes clock resolution effects; no FPS gain claimed."]
            })
            result["sourceSha256"]["measure-graf-frames.py"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
            return result
        finally:
            await context.close()
            await browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--three-module", type=Path, required=True, help="Existing local Three.js r160 ES module")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--screenshot", type=Path)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--frames", type=int, default=60)
    parser.add_argument("--viewport", type=viewport, default=viewport("960x540"))
    parser.add_argument("--dpr", type=float, default=1)
    args = parser.parse_args()
    if not 30 <= args.frames <= 240:
        parser.error("--frames must be 30..240")
    if not math.isfinite(args.dpr) or not 1 <= args.dpr <= 3:
        parser.error("--dpr must be finite and 1..3")
    if args.viewport["width"] * args.viewport["height"] * args.dpr ** 2 > 8388608:
        parser.error("drawing buffer exceeds the 8-megapixel fixture limit")
    if not args.three_module.is_file():
        parser.error("--three-module must name an existing local file")
    result = asyncio.run(measure(args))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "sampleCount": result["snapshot"]["sampleCount"],
                      "fps": result["snapshot"]["fps"], "userVerdict": result["userVerdict"]}))


if __name__ == "__main__":
    main()
