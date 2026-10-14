"""
Headless harness shared by all tools: serves dist/, opens Chromium (SwiftShader WebGL), routes the
three.js CDN to node_modules, stubs fonts and the gamepad API, and gives small helpers.

    from lib.harness import Game
    async with Game(viewport=(1280, 720)) as g:
        await g.title()                       # wait for the title screen
        await g.js("window.__isle.startGame()")
        await g.frames(30)
        await g.shot(path)

Note: SwiftShader is slow; the game clamps dt to 0.05 s, so one rendered frame ≈ 0.05 s of game time.
"""
import asyncio
import functools
import http.server
import json
import os
import socket
import threading

from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, "dist")
THREE_DIR = os.path.join(ROOT, "node_modules", "three")
CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/"


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Game:
    def __init__(self, viewport=(1280, 720), mobile=False, page="test.html"):
        self.viewport, self.mobile, self.page_name = viewport, mobile, page
        self.logs, self.errors = [], []

    async def __aenter__(self):
        if not os.path.isdir(THREE_DIR):
            raise SystemExit("node_modules/three missing — run: npm i three@0.160.0")
        self.port = _free_port()
        handler = functools.partial(_Quiet, directory=DIST)
        self.httpd = http.server.ThreadingHTTPServer(("127.0.0.1", self.port), handler)
        self.httpd.daemon_threads = True
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(args=[
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            "--ignore-gpu-blocklist", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"])
        w, h = self.viewport
        if self.mobile:
            ctx = await self.browser.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=2)
            self.page = await ctx.new_page()
        else:
            self.page = await self.browser.new_page(viewport={"width": w, "height": h})

        async def cdn(route):
            path = os.path.join(THREE_DIR, route.request.url[len(CDN):])
            if os.path.isfile(path):
                await route.fulfill(path=path, headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/javascript"})
            else:
                await route.fulfill(status=404, body="nf")
        await self.page.add_init_script("navigator.getGamepads = () => { throw new DOMException('blocked', 'SecurityError'); };")
        await self.page.route(CDN + "**", cdn)
        await self.page.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, body="", headers={"Content-Type": "text/css"}))
        await self.page.route("https://fonts.gstatic.com/**", lambda r: r.abort())
        self.page.on("console", lambda m: self.logs.append(f"[{m.type}] {m.text}"))
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        await self.page.goto(f"http://127.0.0.1:{self.port}/{self.page_name}")
        return self

    async def __aexit__(self, *exc):
        await self.browser.close()
        await self.pw.stop()
        self.httpd.shutdown()

    async def title(self, timeout=60000):
        await self.page.wait_for_function("window.__isle && window.__isle.G.state === 'title'", timeout=timeout)
        await self.js("window.__isle.perf.lock = true")

    async def js(self, code, arg=None):
        if arg is None:
            return await self.page.evaluate(code)
        return await self.page.evaluate(code, arg)

    async def frames(self, n):
        await self.page.evaluate("""n => new Promise(res => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); })""", n)

    async def shot(self, path, clip=None):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        if clip:
            await self.page.screenshot(path=path, clip=dict(zip(("x", "y", "width", "height"), clip)))
        else:
            await self.page.screenshot(path=path)

    def problems(self):
        """Page errors plus console errors/warnings that are not network noise."""
        noise = ("Failed to load resource", "ERR_TUNNEL", "net::")
        out = list(self.errors)
        out += [l for l in self.logs if (l.startswith("[error]") or l.startswith("[warning]")) and not any(n in l for n in noise)]
        return out


def run(coro):
    return asyncio.run(coro)


def dumps(o):
    return json.dumps(o, ensure_ascii=False, indent=1)
