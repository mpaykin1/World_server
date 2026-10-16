"""Shared headless harness for the A/B acceptance tests.

The game is a single HTML file that imports three.js from jsDelivr. For
reproducibility (and so both experiment arms see identical conditions) the CDN
URLs are served from a local copy of three@0.160.0 (npm install three@0.160.0
in THREE_DIR, default ./node_modules/three next to this repo's ab/ folder).
"""
import os
import sys
from playwright.sync_api import sync_playwright

CDN = "https://cdn.jsdelivr.net/npm/three@0.160.0/"
HERE = os.path.dirname(os.path.abspath(__file__))
THREE_DIR = os.environ.get("THREE_DIR") or os.path.join(HERE, "..", "node_modules", "three")  # set THREE_DIR to the folder of the npm "three@0.160.0" package


def _route(route, request):
    url = request.url
    if url.startswith(CDN):
        fp = os.path.join(THREE_DIR, url[len(CDN):].split("?")[0])
        if os.path.isfile(fp):
            return route.fulfill(path=fp, content_type="text/javascript")
    if "fonts.g" in url:
        return route.fulfill(status=200, body="", content_type="text/css")
    return route.abort()


class Game:
    """Context manager: opens the game in headless Chromium and waits for window.__isle."""

    def __init__(self, html_path):
        self.html_path = os.path.abspath(html_path)
        self.errors = []

    def __enter__(self):
        self._pw = sync_playwright().start()
        self._b = self._pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = self._b.new_context(viewport={"width": 800, "height": 500})
        ctx.route("**/*", lambda r, q: _route(r, q) if q.url.startswith("http") else r.continue_())
        self.page = ctx.new_page()
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.goto("file://" + self.html_path, wait_until="load")
        self.page.wait_for_function("window.__isle && window.__isle.G", timeout=60000)
        return self

    def __exit__(self, *a):
        self._b.close()
        self._pw.stop()

    def ev(self, js, arg=None):
        return self.page.evaluate(js, arg) if arg is not None else self.page.evaluate(js)

    def start_play(self, collected=0):
        """Begin a run and force G.state='play' with a given coin count, spawn timer expired."""
        self.ev("""(c) => { const I = window.__isle; I.startGame(); I.G.state = 'play'; I.G.fade = 0;
                    I.G.collected = c; I.G.play = 99; I.G.spawnT = 0; I.player.invuln = 99; }""", collected)

    def sim(self, seconds, dt=1 / 30):
        """Advance the game logic deterministically in-page (no rendering)."""
        return self.ev("""([secs, dt]) => { const I = window.__isle; const n = Math.round(secs / dt);
                    for (let i = 0; i < n; i++) { I.G.state === 'play' || (I.G.state = 'play'); I.sim(dt, 0, 0, false, false); } return n; }""", [seconds, dt])


    def sim_track(self, seconds, dt=1 / 30):
        """Like sim(), but records which foe objects of each type were ever alive and the max alive at once."""
        return self.ev("""([secs, dt]) => { const I = window.__isle; const n = Math.round(secs / dt);
                    const seen = new Map(); const maxAlive = {};
                    for (let i = 0; i < n; i++) {
                      I.G.state = 'play'; I.sim(dt, 0, 0, false, false);
                      const alive = {};
                      for (const f of I.foes) { if (f.state === 'dissolve' || f.hp <= 0) continue; alive[f.type] = (alive[f.type] || 0) + 1; if (!seen.has(f)) seen.set(f, f.type); }
                      for (const t in alive) maxAlive[t] = Math.max(maxAlive[t] || 0, alive[t]);
                    }
                    const total = {}; for (const t of seen.values()) total[t] = (total[t] || 0) + 1;
                    return { total, maxAlive }; }""", [seconds, dt])


class Report:
    def __init__(self, name):
        self.name = name
        self.checks = []

    def check(self, label, ok, detail=""):
        self.checks.append((label, bool(ok), detail))
        print(("PASS " if ok else "FAIL ") + label + (f"  [{detail}]" if detail else ""))

    def finish(self):
        passed = sum(1 for _, ok, _ in self.checks if ok)
        total = len(self.checks)
        print(f"RESULT {self.name}: {passed}/{total} checks passed")
        print("ACCEPTANCE_PASS" if passed == total and total > 0 else "ACCEPTANCE_FAIL")
        sys.exit(0 if passed == total and total > 0 else 1)
