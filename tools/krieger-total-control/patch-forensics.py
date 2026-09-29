#!/usr/bin/env python3
"""Apply instrumentation-only Krieger Total Control patches to a pinned upstream checkout.

This patch MUST NOT alter gameplay/render policy. It observes the existing pipeline so
portrait, START and USE failures can be explained by measured state transitions.
"""
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-forensics.py <werkkzeug3_kkrieger-root>")

root = Path(sys.argv[1]).resolve()
if not (root / "wasm" / "_start_wasm.cpp").is_file():
    raise SystemExit(f"not a werkkzeug3_kkrieger root: {root}")

def replace_once(rel, old, new):
    p = root / rel
    raw = p.read_bytes()
    try:
        text = raw.decode("utf-8")
        encoding = "utf-8"
    except UnicodeDecodeError:
        # The historical farbrausch tree contains source files with 8-bit
        # text bytes. Latin-1 is a byte-preserving fallback: untouched bytes
        # round-trip 1:1 while our instrumentation stays ASCII.
        text = raw.decode("latin-1")
        encoding = "latin-1"
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected exactly one instrumentation anchor, found {count}: {old[:100]!r}")
    p.write_bytes(text.replace(old, new, 1).encode(encoding))

# Browser collector + compact Observatory panel. C++ emits JSON lines prefixed
# with [kk-forensics]; Module.print/printErr already receive stdout/stderr.
replace_once("wasm/shell.html",
"""  window.__kkLog = [];
  function kkLog(t){
    window.__kkLog.push(t);
""",
"""  window.__kkLog = [];
  window.__kkForensics = [];
  window.__kkForensicsEnabled = true;
  window.__kkForensicsPush = function(evt){
    if(!evt || !window.__kkForensicsEnabled) return;
    evt.seq = window.__kkForensics.length;
    evt.browserNow = performance.now();
    window.__kkForensics.push(evt);
    if(window.__kkForensics.length > 20000) window.__kkForensics.splice(0,5000);
    var out = document.getElementById('kkobsout');
    if(out) {
      var keep = window.__kkForensics.slice(-12).map(function(x){
        return x.stage + ' ' + JSON.stringify(x).slice(0,180);
      });
      out.textContent = keep.join('\\n');
    }
  };
  function kkBrowserSnapshot(reason){
    var c=document.getElementById('canvas'), r=c.getBoundingClientRect(), vv=window.visualViewport;
    window.__kkForensicsPush({
      stage:'browser.viewport', reason:reason,
      screen:[screen.width,screen.height],
      inner:[innerWidth,innerHeight],
      visual:vv?[vv.width,vv.height,vv.offsetLeft,vv.offsetTop, vv.scale]:null,
      dpr:devicePixelRatio||1,
      canvasCss:[r.left,r.top,r.width,r.height],
      canvasBacking:[c.width,c.height],
      fullscreen:!!(document.fullscreenElement||document.webkitFullscreenElement),
      orientation:screen.orientation?screen.orientation.type:null
    });
  }
  function kkLog(t){
    if(typeof t === 'string') {
      var marker='[kk-forensics] ';
      var at=t.indexOf(marker);
      if(at>=0) {
        try { window.__kkForensicsPush(JSON.parse(t.slice(at+marker.length))); } catch(e) {}
      }
    }
    window.__kkLog.push(t);
""")

replace_once("wasm/shell.html",
"""  #fs:hover{opacity:1}
  :fullscreen #fs{display:none}
""",
"""  #fs:hover{opacity:1}
  :fullscreen #fs{display:none}
  #kkobs{position:fixed;left:8px;bottom:8px;z-index:20;max-width:min(720px,92vw);
         max-height:42vh;overflow:auto;background:rgba(0,0,0,.82);border:1px solid #555;
         color:#9ef;padding:6px;font:10px/1.25 monospace}
  #kkobs summary{cursor:pointer;color:#fff;font-size:11px}
  #kkobsout{white-space:pre-wrap;margin-top:5px}
""")

replace_once("wasm/shell.html",
"""<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>
<div id="start">""",
"""<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>
<details id="kkobs"><summary>Krieger Observatory · Forensics</summary><div id="kkobsout">waiting for telemetry…</div></details>
<div id="start">""")

replace_once("wasm/shell.html",
"""    onRuntimeInitialized: function(){ if(statusEl) statusEl.textContent = 'ready'; },
""",
"""    onRuntimeInitialized: function(){
      window.__kkForensicsPush({stage:'lifecycle.runtime_initialized'});
      kkBrowserSnapshot('runtime_initialized');
      if(statusEl) statusEl.textContent = 'ready';
    },
""")

replace_once("wasm/shell.html",
"""  function enterFullscreen(){
    var el = document.documentElement;
""",
"""  function enterFullscreen(){
    window.__kkForensicsPush({stage:'lifecycle.fullscreen_request'});
    var el = document.documentElement;
""")

replace_once("wasm/shell.html",
"""    if(p && p.then) p.then(function(){
      try { if(navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']); } catch(e) {}
    }).catch(function(){});
""",
"""    if(p && p.then) p.then(function(){
      window.__kkForensicsPush({stage:'lifecycle.fullscreen_resolved'});
      kkBrowserSnapshot('fullscreen_resolved');
      try { if(navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']); } catch(e) {}
    }).catch(function(e){
      window.__kkForensicsPush({stage:'lifecycle.fullscreen_rejected',message:String(e)});
    });
""")

replace_once("wasm/shell.html",
"""  document.getElementById('start').addEventListener('click', function(){
    if(fsStart.checked) enterFullscreen();
    Module.kkRes = pickedRes();
    this.remove();
""",
"""  document.getElementById('start').addEventListener('pointerdown', function(){
    window.__kkForensicsPush({stage:'lifecycle.start_pointerdown'});
  });
  document.getElementById('start').addEventListener('click', function(){
    window.__kkForensicsPush({stage:'lifecycle.start_click'});
    kkBrowserSnapshot('before_start');
    if(fsStart.checked) enterFullscreen();
    Module.kkRes = pickedRes();
    window.__kkForensicsPush({stage:'lifecycle.callmain_begin',requestedRes:Module.kkRes});
    this.remove();
""")

replace_once("wasm/shell.html",
"""    Module.callMain(data === '3383' ? [] : ['/kkrieger_beta.kx']);
  });
""",
"""    Module.callMain(data === '3383' ? [] : ['/kkrieger_beta.kx']);
    window.__kkForensicsPush({stage:'lifecycle.callmain_return'});
  });
  addEventListener('resize',function(){kkBrowserSnapshot('resize');},{passive:true});
  addEventListener('orientationchange',function(){kkBrowserSnapshot('orientationchange');},{passive:true});
  if(window.visualViewport) visualViewport.addEventListener('resize',function(){kkBrowserSnapshot('visualViewport.resize');},{passive:true});
  document.addEventListener('fullscreenchange',function(){kkBrowserSnapshot('fullscreenchange');});
  requestAnimationFrame(function(){kkBrowserSnapshot('first_animation_frame');});
""")

# Platform-level screen/backbuffer and real GL viewport.
replace_once("wasm/_start_wasm.cpp",
# Initial platform setup does not necessarily call InitScreens before the
# first frame, so capture the same screen state in InitX as well.
replace_once("wasm/_start_wasm.cpp",
"""  Screen[0].XSize = ConfigX;
  Screen[0].YSize = ConfigY;
  ViewportX = ConfigX;
  ViewportY = ConfigY;
  CpuMask = 0;
""",
"""  Screen[0].XSize = ConfigX;
  Screen[0].YSize = ConfigY;
  ViewportX = ConfigX;
  ViewportY = ConfigY;
  fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"engine.screen\\\",\\\"reason\\\":\\\"InitX\\\",\\\"config\\\":[%d,%d],\\\"viewportXY\\\":[%d,%d]}\\n",
          ConfigX,ConfigY,ViewportX,ViewportY);
  CpuMask = 0;
""")

"""  fprintf(stderr,"[kk] screen: %dx%d\\n",ConfigX,ConfigY);
}
""",
"""  fprintf(stderr,"[kk] screen: %dx%d\\n",ConfigX,ConfigY);
  fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"engine.screen\\\",\\\"config\\\":[%d,%d],\\\"viewportXY\\\":[%d,%d]}\\n",
          ConfigX,ConfigY,ViewportX,ViewportY);
}
""")

replace_once("wasm/_start_wasm.cpp",
"""  KKTRACE("viewport rt=%d win=%d,%d-%d,%d\\n",vp.RenderTarget,vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1);
""",
"""  KKTRACE("viewport rt=%d win=%d,%d-%d,%d\\n",vp.RenderTarget,vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1);
  {
    GLint gv[4] = {0,0,0,0};
    glGetIntegerv(GL_VIEWPORT,gv);
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"engine.set_viewport.before\\\",\\\"rt\\\":%d,\\\"window\\\":[%d,%d,%d,%d],\\\"glBefore\\\":[%d,%d,%d,%d]}\\n",
            vp.RenderTarget,vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1,gv[0],gv[1],gv[2],gv[3]);
  }
""")

# This is the key source-verified portrait policy. Observe it, do not change it.
replace_once("mainplayer.cpp",
"""    GenOverlayManager->SetMasterViewport(vp);
    RenderTargetManager->SetMasterViewport(vp);
""",
"""#if defined(__EMSCRIPTEN__)
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"mainplayer.master_viewport\\\",\\\"config\\\":[%d,%d],\\\"window\\\":[%d,%d,%d,%d],\\\"ratio\\\":%.6f}\\n",
            sSystem->ConfigX,sSystem->ConfigY,vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1,
            vp.Window.YSize() ? 1.0f*vp.Window.XSize()/vp.Window.YSize() : 0.0f);
#endif
    GenOverlayManager->SetMasterViewport(vp);
    RenderTargetManager->SetMasterViewport(vp);
""")

replace_once("mainplayer.cpp",
"""    Environment->Aspect = 2.0f;

    root = Document->RootOps[Document->CurrentRoot];
""",
"""    Environment->Aspect = 2.0f;
#if defined(__EMSCRIPTEN__)
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"mainplayer.projection_aspect\\\",\\\"aspect\\\":%.6f,\\\"masterWindow\\\":[%d,%d,%d,%d]}\\n",
            Environment->Aspect,vp.Window.x0,vp.Window.y0,vp.Window.x1,vp.Window.y1);
#endif

    root = Document->RootOps[Document->CurrentRoot];
""")

# IPP/render-target viewport before and after its fractional crop.
replace_once("genoverlay.cpp",
"""      GenOverlayManager->PrepareViewport(rt,view);
#if defined(__EMSCRIPTEN__)
      {
""",
"""      GenOverlayManager->PrepareViewport(rt,view);
#if defined(__EMSCRIPTEN__)
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"ipp.viewport.pre_fraction\\\",\\\"op\\\":%d,\\\"rtSizeClass\\\":%d,\\\"window\\\":[%d,%d,%d,%d],\\\"fraction\\\":[%.6f,%.6f,%.6f,%.6f]}\\n",
              parent->OpId,rt->Size,view.Window.x0,view.Window.y0,view.Window.x1,view.Window.y1,fx0,fy0,fx1,fy1);
      {
""")

replace_once("genoverlay.cpp",
"""      if(r.x0<r.x1 && r.y0<r.y1)
        view.Window = r;
      sSystem->SetViewport(view);
""",
"""      if(r.x0<r.x1 && r.y0<r.y1)
        view.Window = r;
#if defined(__EMSCRIPTEN__)
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"ipp.viewport.post_fraction\\\",\\\"op\\\":%d,\\\"rtSizeClass\\\":%d,\\\"window\\\":[%d,%d,%d,%d]}\\n",
              parent->OpId,rt->Size,view.Window.x0,view.Window.y0,view.Window.x1,view.Window.y1);
#endif
      sSystem->SetViewport(view);
""")

# Weapon Observatory: request, inventory gate, pending state, and true commit.
replace_once("kkriegergame.cpp",
"""      i = weaponswap[key&7];
      if(i>=0 && Player.Weapon[i])
        Player.NextWeapon = i;
""",
"""      i = weaponswap[key&7];
#if defined(__EMSCRIPTEN__)
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"weapon.request\\\",\\\"key\\\":%u,\\\"mapped\\\":%d,\\\"owned\\\":%d,\\\"current\\\":%d,\\\"next\\\":%d,\\\"timer\\\":%.6f}\\n",
              (unsigned)key,i,(i>=0 && i<8)?Player.Weapon[i]:0,Player.CurrentWeapon,Player.NextWeapon,WeaponTimer);
#endif
      if(i>=0 && Player.Weapon[i])
      {
        Player.NextWeapon = i;
#if defined(__EMSCRIPTEN__)
        fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"weapon.request_accepted\\\",\\\"mapped\\\":%d,\\\"current\\\":%d,\\\"next\\\":%d,\\\"timer\\\":%.6f}\\n",
                i,Player.CurrentWeapon,Player.NextWeapon,WeaponTimer);
#endif
      }
""")

replace_once("kkriegergame.cpp",
"""    Player.CurrentWeapon = Player.NextWeapon;
    WeaponEvent.Exit();
""",
"""    Player.CurrentWeapon = Player.NextWeapon;
#if defined(__EMSCRIPTEN__)
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"weapon.commit\\\",\\\"current\\\":%d,\\\"next\\\":%d,\\\"timerBeforeReset\\\":%.6f}\\n",
            Player.CurrentWeapon,Player.NextWeapon,WeaponTimer);
#endif
    WeaponEvent.Exit();
""")

print("Krieger Total Control forensics patch: PASS")
