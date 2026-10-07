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
  #kkobstools{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
  #kkobstools button{background:#111;color:#cff;border:1px solid #466;padding:4px 6px;
                     font:10px/1.1 monospace;cursor:pointer}
  #kkobstools button[data-state]:after{content:' · ' attr(data-state);color:#fff}
""")

replace_once("wasm/shell.html",
"""<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>
<div id="start">""",
"""<button id="fs" title="fullscreen (Esc or the button leaves it)">&#x26F6; fullscreen</button>
<details id="kkobs"><summary>Krieger Observatory · Forensics</summary>
<div id="kkobstools">
  <button data-kkcmd="1">TRACE OPS</button>
  <button data-kkcmd="2">DUMP JOBS</button>
  <button data-kkcmd="3">FRUSTUM</button>
  <button data-kkcmd="4">MATERIAL</button>
  <button data-kkcmd="5">PASSES</button>
  <button data-kkcmd="6">SHADOW MODE</button>
  <button data-kkcmd="7">PORTALS</button>
  <button data-kkcmd="8">LIGHT TERM</button>
  <button data-kkcmd="9">SHADOW VOLUMES</button>
  <button data-kkcmd="10">ALPHA TEST</button>
  <button data-kkcmd="11">CULL MODE</button>
  <button data-kkcmd="12">LIGHT TEST</button>
  <button data-kkcmd="13">STENCIL VOLUMES</button>
  <button data-kkcmd="14">R/B SWIZZLE</button>
  <button data-kkcmd="15">FREEZE TIME</button>
</div>
<div id="kkobsout">waiting for telemetry…</div></details>
<div id="start">""")

replace_once("wasm/shell.html",
"""    onRuntimeInitialized: function(){ if(statusEl) statusEl.textContent = 'ready'; },
""",
"""    onRuntimeInitialized: function(){
      window.__kkForensicsPush({stage:'lifecycle.runtime_initialized'});
      kkBrowserSnapshot('runtime_initialized');
      document.querySelectorAll('[data-kkcmd]').forEach(function(b){ b.disabled=false; });
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
  document.querySelectorAll('[data-kkcmd]').forEach(function(b){
    b.disabled=true;
    b.addEventListener('click',function(e){
      e.preventDefault(); e.stopPropagation();
      if(!Module || !Module.ccall) return;
      var code=Number(this.getAttribute('data-kkcmd'));
      try {
        var state=Module.ccall('kkObsCommand','number',['number'],[code]);
        this.setAttribute('data-state',String(state));
        window.__kkForensicsPush({stage:'observatory.command',code:code,state:state,label:this.textContent});
      } catch(err) {
        window.__kkForensicsPush({stage:'observatory.command_error',code:code,message:String(err)});
      }
    });
  });
""")

# Observatory controls call existing renderer debug switches directly. They are
# inert until a human presses a debug button and do not change release defaults.
replace_once("wasm/_start_wasm.cpp",
"""extern sInt kkExecTrace;                                  // kdoc.cpp: one-frame op trace
extern sInt kkPaintAllSectors;                            // engine.cpp: portal visibility off
""",
"""extern sInt kkExecTrace;                                  // kdoc.cpp: one-frame op trace
extern sInt kkPaintAllSectors;                            // engine.cpp: portal visibility off
extern sInt kkUsageFilter;                                // engine.cpp: render pass filter
extern sInt kkLightDebugView;                             // wasm/render2004.cpp: lighting term view
extern sInt kkSwizzleOutput;                              // wasm/render2004.cpp: shader output debug
extern sInt kkCycleShadows();                             // genoverlay.cpp: shadow/light mode
""")

replace_once("wasm/_start_wasm.cpp",
"""static sInt kkCullDebug = 0;                     // debug (J): 1 culling off, 2 inverted winding
static void ApplyCull()
""",
"""static sInt kkCullDebug = 0;                     // debug (J): 1 culling off, 2 inverted winding
static sInt kkObsFreezeTime = 0;                  // Observatory-only deterministic lab clock
static sInt kkObsFrozenTime = 0;

extern "C" EMSCRIPTEN_KEEPALIVE int kkObsCommand(int code)
{
  switch(code)
  {
  case 1: kkExecTrace = 1; return 1;
  case 2: kkDumpJobs = 1; return 1;
  case 3: kkNoFrustumCull = !kkNoFrustumCull; return kkNoFrustumCull;
  case 4: kkOnlyMtrl = (kkOnlyMtrl + 1) % 17; return kkOnlyMtrl;
  case 5: kkUsageFilter = (kkUsageFilter + 1) % 3; return kkUsageFilter;
  case 6: return kkCycleShadows();
  case 7: kkPaintAllSectors = !kkPaintAllSectors; return kkPaintAllSectors;
  case 8: kkLightDebugView = (kkLightDebugView + 1) % 7; return kkLightDebugView;
  case 9: kkShowShadowVolumes = !kkShowShadowVolumes; return kkShowShadowVolumes;
  case 10: kkAlphaTestOff = !kkAlphaTestOff; return kkAlphaTestOff;
  case 11: kkCullDebug = (kkCullDebug + 1) % 3; return kkCullDebug;
  case 12: kkLightTestOff = (kkLightTestOff + 1) % 4; return kkLightTestOff;
  case 13: kkStencilMarkVolumes = !kkStencilMarkVolumes; return kkStencilMarkVolumes;
  case 14: kkSwizzleOutput = !kkSwizzleOutput; return kkSwizzleOutput;
  case 15:
    if(!kkObsFreezeTime)
    {
      kkObsFrozenTime = sSystem->GetTime();
      kkObsFreezeTime = 1;
    }
    else
      kkObsFreezeTime = 0;
    return kkObsFreezeTime;
  default: return -1;
  }
}

static void ApplyCull()
""")

# Observatory-only deterministic clock: while command 15 is active the normal
# renderer continues to run, but game/spline time is held on one native tick.
# Default behavior is unchanged because kkObsFreezeTime starts at zero.
replace_once("wasm/_start_wasm.cpp",
"""static sInt kkTicks()                       { return (sInt)emscripten_get_now(); }
sInt sSystem_::GetTime()                    { return kkTicks() - gStartTicks; }
""",
"""static sInt kkTicks()                       { return (sInt)emscripten_get_now(); }
sInt sSystem_::GetTime()                    { return kkObsFreezeTime ? kkObsFrozenTime : kkTicks() - gStartTicks; }
""")

# Platform-level screen/backbuffer and real GL viewport.
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

replace_once("wasm/_start_wasm.cpp",
"""  fprintf(stderr,"[kk] screen: %dx%d\\n",ConfigX,ConfigY);
}
""",
"""  fprintf(stderr,"[kk] screen: %dx%d\\n",ConfigX,ConfigY);
  fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"engine.screen\\\",\\\"reason\\\":\\\"InitScreens\\\",\\\"config\\\":[%d,%d],\\\"viewportXY\\\":[%d,%d]}\\n",
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


# Geometry provenance: record generated mesh -> runtime EngMesh expansion.
replace_once("engine.cpp",
"""  for(sInt i=1;i<Mtrl.Count;i++)
    Mtrl[i].Material->AddRef();

  PrepareJobs(mesh);
}
""",
"""  for(sInt i=1;i<Mtrl.Count;i++)
    Mtrl[i].Material->AddRef();

  PrepareJobs(mesh);
#if defined(__EMSCRIPTEN__)
  {
    static sInt obsGenMesh;
    if(obsGenMesh++ < 256)
    {
      sInt indices = 0;
      for(sInt ji=0;ji<Jobs.Count;ji++) indices += Jobs[ji].IndexCount;
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMesh\\\",\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              mesh->Face.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
    }
  }
#endif
}
""")

replace_once("engine.cpp",
"""  sRelease(Animation);
  Animation = mesh->Animation;
  if(Animation)
    Animation->AddRef();
}
""",
"""  sRelease(Animation);
  Animation = mesh->Animation;
  if(Animation)
    Animation->AddRef();
#if defined(__EMSCRIPTEN__)
  {
    static sInt obsMinMesh;
    if(obsMinMesh++ < 256)
    {
      sInt indices = 0;
      for(sInt ji=0;ji<Jobs.Count;ji++) indices += Jobs[ji].IndexCount;
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMinMesh\\\",\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              mesh->Faces.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
    }
  }
#endif
}
""")

# Material provenance: exact pass creation and usage/program classification.
replace_once("genmaterial.cpp",
"""#include "rtmanager.hpp"
""",
"""#include "rtmanager.hpp"
#if defined(__EMSCRIPTEN__)
#include <stdio.h>
#endif
""")

replace_once("genmaterial.cpp",
"""  ps->Pass = pass;
  ps->Size = size;
  ps->Aspect = aspect;
}
""",
"""  ps->Pass = pass;
  ps->Size = size;
  ps->Aspect = aspect;
#if defined(__EMSCRIPTEN__)
  {
    static sInt obsPass;
    if(obsPass++ < 512)
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"material.pass\\\",\\\"usage\\\":%d,\\\"program\\\":%d,\\\"pass\\\":%d,\\\"size\\\":%.6f,\\\"aspect\\\":%.6f,\\\"materialPassCount\\\":%d}\\n",
              use,program,pass,size,aspect,Passes.Count);
  }
#endif
}
""")

# Scene/level provenance: count portal graph and the visible sectors before
# execution resets SectorPaint.
replace_once("engine.cpp",
"""  // exec phase
  sZONE(PortalJob);

  for(GenScene *job=SectorJobs;job;job=job->Next)
""",
"""#if defined(__EMSCRIPTEN__)
  {
    static sInt obsPortalFrame;
    if(obsPortalFrame++ < 3 || (obsPortalFrame % 60) == 0)
    {
      sInt sectors = 0, visible = 0, portals = 0;
      for(GenScene *sj=SectorJobs;sj;sj=sj->Next)
      {
        sectors++;
        if(sj->SectorPaint) visible++;
      }
      for(PortalJob *pj=PortalJobs;pj;pj=pj->Next) portals++;
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"scene.portals\\\",\\\"sectors\\\":%d,\\\"visibleSectors\\\":%d,\\\"portals\\\":%d,\\\"observer\\\":%d}\\n",
              sectors,visible,portals,observerCell?1:0);
    }
  }
#endif

  // exec phase
  sZONE(PortalJob);

  for(GenScene *job=SectorJobs;job;job=job->Next)
""")

# Generic renderer frame statistics after the actual paint-job graph is built.
replace_once("engine.cpp",
"""  // FIRE! (damn, this routine is getting shorter and shorter)
  BuildPaintJobs();
#if defined(__EMSCRIPTEN__)
  {
    if(kkExecTrace)
""",
"""  // FIRE! (damn, this routine is getting shorter and shorter)
  BuildPaintJobs();
#if defined(__EMSCRIPTEN__)
  {
    static sInt obsRenderFrame;
    if(obsRenderFrame++ < 3 || (obsRenderFrame % 60) == 0)
    {
      sInt meshes=0,effects=0,usage[ENGU_MAX];
      sSetMem(usage,0,sizeof(usage));
      for(MeshJob *j=MeshJobs;j;j=j->Next) meshes++;
      for(EffectJob *j=EffectJobs;j;j=j->Next) effects++;
      for(sInt i=0;i<PaintJobs.Count;i++)
      {
        sInt u=(PaintJobs[i]->SortKey >> 16) & 0xf;
        if(u>=0 && u<ENGU_MAX) usage[u]++;
      }
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"renderer.frame\\\",\\\"mode\\\":\\\"generic\\\",\\\"meshJobs\\\":%d,\\\"effectJobs\\\":%d,\\\"paintJobs\\\":%d,\\\"lights\\\":%d,\\\"usage\\\":[%d,%d,%d,%d,%d,%d,%d,%d]}\\n",
              meshes,effects,PaintJobs.Count,LightJobCount,
              usage[0],usage[1],usage[2],usage[3],usage[4],usage[5],usage[6],usage[7]);
    }
    if(kkExecTrace)
""")

# Breakpoint 2004 renderer has a different sort-key layout and shadow path.
replace_once("engine.cpp",
"""  BuildPaintJobs();
  Build04 = sFALSE;

  if(kkExecTrace)
""",
"""  BuildPaintJobs();
  Build04 = sFALSE;

  {
    static sInt obsRender04Frame;
    if(obsRender04Frame++ < 3 || (obsRender04Frame % 60) == 0)
    {
      sInt meshes=0,effects=0,usage04[5];
      sSetMem(usage04,0,sizeof(usage04));
      for(MeshJob *j=MeshJobs;j;j=j->Next) meshes++;
      for(EffectJob *j=EffectJobs;j;j=j->Next) effects++;
      for(sInt i=0;i<PaintJobs.Count;i++)
      {
        sInt u=(PaintJobs[i]->SortKey >> 28) & 0xf;
        if(u>=0 && u<5) usage04[u]++;
      }
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"renderer.frame\\\",\\\"mode\\\":\\\"2004\\\",\\\"meshJobs\\\":%d,\\\"effectJobs\\\":%d,\\\"paintJobs\\\":%d,\\\"rawLights\\\":%d,\\\"selectedLights\\\":%d,\\\"shadowLights\\\":%d,\\\"shadowJobs\\\":%d,\\\"usage04\\\":[%d,%d,%d,%d,%d]}\\n",
              meshes,effects,PaintJobs.Count,Lights04Count,count,shadows,Shadow04Count,
              usage04[0],usage04[1],usage04[2],usage04[3],usage04[4]);
    }
  }

  if(kkExecTrace)
""")

# Emit the first three GPU frames immediately so labs do not need to wait 120
# software-rendered frames before proving that paint jobs reached WebGL.
replace_once("wasm/_start_wasm.cpp",
"""  kkOpaqueBackbuffer();
  gFrame++;
  if(gFrame % 120 == 0)
""",
"""  kkOpaqueBackbuffer();
  gFrame++;
  if(gFrame <= 3)
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"gpu.frame\\\",\\\"frame\\\":%d,\\\"viewportChanges\\\":%d,\\\"clears\\\":%d,\\\"setups\\\":%d,\\\"instancesTranslated\\\":%d,\\\"instancesPlaceholder\\\":%d,\\\"drawCalls\\\":%d,\\\"emptyDraws\\\":%d,\\\"geoEnds\\\":%d,\\\"statesApplied\\\":%d,\\\"statesSkipped\\\":%d,\\\"glError\\\":0}\\n",
            gFrame,cViewport,cClear,cSetup,cInstT,cInstP,cDraw,cDrawEmpty,cGeoEnd,cStateSet,cStateSkip);
  if(gFrame % 120 == 0)
""")

# Platform/GPU-side frame counters: this is the final CPU->WebGL proof that
# render jobs actually produced draw/setup/viewport traffic.
replace_once("wasm/_start_wasm.cpp",
"""    fprintf(stderr,"[kk]   states applied=%d skipped=%d\\n",cStateSet,cStateSkip);
    cViewport=cClear=cSetup=cInstT=cInstP=cDraw=cDrawEmpty=cGeoEnd=0;
""",
"""    fprintf(stderr,"[kk]   states applied=%d skipped=%d\\n",cStateSet,cStateSkip);
    fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"gpu.frame\\\",\\\"frame\\\":%d,\\\"viewportChanges\\\":%d,\\\"clears\\\":%d,\\\"setups\\\":%d,\\\"instancesTranslated\\\":%d,\\\"instancesPlaceholder\\\":%d,\\\"drawCalls\\\":%d,\\\"emptyDraws\\\":%d,\\\"geoEnds\\\":%d,\\\"statesApplied\\\":%d,\\\"statesSkipped\\\":%d,\\\"glError\\\":%u}\\n",
            gFrame,cViewport,cClear,cSetup,cInstT,cInstP,cDraw,cDrawEmpty,cGeoEnd,cStateSet,cStateSkip,(unsigned)e);
    cViewport=cClear=cSetup=cInstT=cInstP=cDraw=cDrawEmpty=cGeoEnd=0;
""")


# Data/compression provenance: one compact export becomes an operator graph,
# events, splines, blobs, audio data and eventually generated runtime objects.
replace_once("kdoc.cpp",
"""  CurrentRoot = 0;

  dataPtr = data;
}
""",
"""  CurrentRoot = 0;

#if defined(__EMSCRIPTEN__)
  fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"data.document\\\",\\\"classes\\\":%d,\\\"ops\\\":%d,\\\"splines\\\":%d,\\\"events\\\":%d,\\\"songBytes\\\":%d,\\\"sampleBytes\\\":%d,\\\"bytesConsumed\\\":%d,\\\"beta2004\\\":%d}\\n",
          nClasses,nOps,nSplines,Events.Count,SongSize,SampleSize,(int)(data-dataPtr),kkBetaData?1:0);
#endif
  dataPtr = data;
}
""")

# Creature/game-state Observatory. This is emitted after simulation/collision
# for the tick, not from a UI proxy.
replace_once("kkriegergame.cpp",
"""// diagnostics

#if !sPLAYER
""",
"""#if defined(__EMSCRIPTEN__)
  {
    static sInt obsGameTick;
    if(obsGameTick++ < 3 || (obsGameTick % 60) == 0)
    {
      sInt states[5] = {0,0,0,0,0};
      sInt alive = 0;
      for(sInt mi=0;mi<Monsters.Count;mi++)
      {
        KKriegerMonster *m = Monsters[mi];
        if(m->Life > 0) alive++;
        if(m->State >= 0 && m->State < 5) states[m->State]++;
      }
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"game.state\\\",\\\"tick\\\":%d,\\\"player\\\":{\\\"life\\\":%d,\\\"armor\\\":%d,\\\"weapon\\\":%d,\\\"nextWeapon\\\":%d,\\\"weaponTimer\\\":%.6f,\\\"pos\\\":[%.5f,%.5f,%.5f],\\\"dir\\\":%.6f,\\\"look\\\":%.6f,\\\"onGround\\\":%d},\\\"monsters\\\":{\\\"count\\\":%d,\\\"alive\\\":%d,\\\"states\\\":[%d,%d,%d,%d,%d]},\\\"shots\\\":%d,\\\"dynamicCells\\\":%d}\\n",
              TickCount,Player.Life,Player.Armor,Player.CurrentWeapon,Player.NextWeapon,WeaponTimer,
              PlayerPos.x,PlayerPos.y,PlayerPos.z,PlayerDir,PlayerLook,OnGround?1:0,
              Monsters.Count,alive,states[0],states[1],states[2],states[3],states[4],Shots.Count,DCellUsed);
      sInt samples = sMin(Monsters.Count,4);
      for(sInt mi=0;mi<samples;mi++)
      {
        KKriegerMonster *m = Monsters[mi];
        fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"creature.sample\\\",\\\"index\\\":%d,\\\"type\\\":%d,\\\"state\\\":%d,\\\"life\\\":%d,\\\"lifeMax\\\":%d,\\\"armor\\\":%d,\\\"weaponKind\\\":%d,\\\"flags\\\":%d,\\\"pos\\\":[%.5f,%.5f,%.5f]}\\n",
                mi,m->WeaponKind,m->State,m->Life,m->LifeMax,m->Armor,m->WeaponKind,m->Flags,
                m->Collider.Pos.x,m->Collider.Pos.y,m->Collider.Pos.z);
      }
    }
  }
#endif

// diagnostics

#if !sPLAYER
""")



# Provenance bridge: reverse the KDoc runtime cache table so renderer-side
# objects can name the exact compact-data operator that produced them.
replace_once("kdoc.cpp",
"""KObject *kkOpCache(sInt index)                            // debug: cached object of the index-th operator
{
  return (kkDoc && index >= 0 && index < kkDoc->Ops.Count) ? kkDoc->Ops[index].Cache : 0;
}
""",
"""KObject *kkOpCache(sInt index)                            // debug: cached object of the index-th operator
{
  return (kkDoc && index >= 0 && index < kkDoc->Ops.Count) ? kkDoc->Ops[index].Cache : 0;
}

sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result)
{
  classId = -1;
  result = -1;
  if(!kkDoc || !object) return -1;
  for(sInt i=0;i<kkDoc->Ops.Count;i++)
  {
    KOp &op = kkDoc->Ops[i];
    if(op.Cache == object)
    {
      classId = kkClassIds[op.Command & 255];
      result = op.Result;
      return op.OpId;
    }
  }
  return -1;
}
""")

replace_once("engine.cpp",
"""extern KObject *kkOpCache(sInt index);                    // kdoc.cpp: cached object of an operator
""",
"""extern KObject *kkOpCache(sInt index);                    // kdoc.cpp: cached object of an operator
extern sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result);
""")

# Enrich mesh provenance with the exact KDoc operator when the generated mesh
# itself is a cached operator result.
replace_once("engine.cpp",
"""      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMesh\\\",\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              mesh->Face.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
""",
"""      sInt originClass=-1,originResult=-1;
      sInt originOp=kkCacheOrigin(mesh,originClass,originResult);
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMesh\\\",\\\"originOp\\\":%d,\\\"originClass\\\":%d,\\\"originResult\\\":%d,\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              originOp,originClass,originResult,mesh->Face.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
""")

replace_once("engine.cpp",
"""      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMinMesh\\\",\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              mesh->Faces.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
""",
"""      sInt originClass=-1,originResult=-1;
      sInt originOp=kkCacheOrigin(mesh,originClass,originResult);
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"geometry.mesh\\\",\\\"kind\\\":\\\"GenMinMesh\\\",\\\"originOp\\\":%d,\\\"originClass\\\":%d,\\\"originResult\\\":%d,\\\"sourceFaces\\\":%d,\\\"vertices\\\":%d,\\\"parts\\\":%d,\\\"materials\\\":%d,\\\"jobs\\\":%d,\\\"triangles\\\":%d,\\\"animated\\\":%d}\\n",
              originOp,originClass,originResult,mesh->Faces.Count,VertCount,PartCount,Mtrl.Count,Jobs.Count,indices/3,Animation?1:0);
""")

# During the first observed renderer frame connect the selected material
# pointer back to its compact-data operator too.
replace_once("engine.cpp",
"""      GenMaterialPass *pass = &meshMat->Material->Passes[j];
        sInt usage = pass->Usage;
""",
"""      GenMaterialPass *pass = &meshMat->Material->Passes[j];
#if defined(__EMSCRIPTEN__)
      {
        static sInt obsMaterialJob;
        if(obsMaterialJob++ < 256)
        {
          sInt originClass=-1,originResult=-1;
          sInt originOp=kkCacheOrigin(meshMat->Material,originClass,originResult);
          fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"material.job\\\",\\\"originOp\\\":%d,\\\"originClass\\\":%d,\\\"originResult\\\":%d,\\\"meshMaterialIndex\\\":%d,\\\"passIndex\\\":%d,\\\"usage\\\":%d,\\\"program\\\":%d,\\\"renderPass\\\":%d}\\n",
                  originOp,originClass,originResult,i,j,pass->Usage,pass->Program,pass->Pass);
        }
      }
#endif
        sInt usage = pass->Usage;
""")


# Material-pass reverse provenance. Unlike a material object, PaintJob carries
# only GenMaterialPass*, so resolve that pass back to the owning KDoc operator.
replace_once("kdoc.cpp",
"""sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result)
{
  classId = -1;
  result = -1;
  if(!kkDoc || !object) return -1;
  for(sInt i=0;i<kkDoc->Ops.Count;i++)
  {
    KOp &op = kkDoc->Ops[i];
    if(op.Cache == object)
    {
      classId = kkClassIds[op.Command & 255];
      result = op.Result;
      return op.OpId;
    }
  }
  return -1;
}
""",
"""sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result)
{
  classId = -1;
  result = -1;
  if(!kkDoc || !object) return -1;
  for(sInt i=0;i<kkDoc->Ops.Count;i++)
  {
    KOp &op = kkDoc->Ops[i];
    if(op.Cache == object)
    {
      classId = kkClassIds[op.Command & 255];
      result = op.Result;
      return op.OpId;
    }
  }
  return -1;
}

sInt kkMaterialPassOrigin(GenMaterialPass *needle,sInt &classId,sInt &result)
{
  classId = -1;
  result = -1;
  if(!kkDoc || !needle) return -1;
  for(sInt i=0;i<kkDoc->Ops.Count;i++)
  {
    KOp &op = kkDoc->Ops[i];
    if(!op.Cache || op.Cache->ClassId != KC_MATERIAL) continue;
    GenMaterial *gm = (GenMaterial *)op.Cache;
    for(sInt p=0;p<gm->Passes.Count;p++)
      if(&gm->Passes[p] == needle)
      {
        classId = kkClassIds[op.Command & 255];
        result = op.Result;
        return op.OpId;
      }
  }
  return -1;
}
""")

replace_once("engine.cpp",
"""extern sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result);
""",
"""extern sInt kkCacheOrigin(KObject *object,sInt &classId,sInt &result);
extern sInt kkMaterialPassOrigin(GenMaterialPass *pass,sInt &classId,sInt &result);
extern "C" void kkObsDrawContext(sInt originOp,sInt originClass,sInt originResult,
                                  sInt jobId,sInt usage,sInt renderPass,sInt program,
                                  sInt vertices,sInt indices);
""")

replace_once("engine.cpp",
"""  // skip empty jobs
  if(!job->VertexCount)
    return;

  //sZONE(PaintJob);
""",
"""  // skip empty jobs
  if(!job->VertexCount)
    return;

#if defined(__EMSCRIPTEN__)
  {
    static sInt obsPaintContext;
    if(obsPaintContext++ < 512)
    {
      sInt originClass=-1,originResult=-1;
      sInt originOp=kkMaterialPassOrigin(pass,originClass,originResult);
      kkObsDrawContext(originOp,originClass,originResult,
                       jobId,pass?pass->Usage:-1,pass?pass->Pass:-1,job->Program,
                       job->VertexCount,job->IndexCount);
    }
  }
#endif

  //sZONE(PaintJob);
""")

# GPU bridge stores the engine-side provenance context and attaches it to the
# next concrete WebGL geometry draws.
replace_once("wasm/_start_wasm.cpp",
"""static sInt cViewport, cClear, cSetup, cInstT, cInstP, cDraw, cDrawEmpty, cGeoEnd;
#define KKTRACE(...) do { if(gTraceLeft>0) { gTraceLeft--; fprintf(stderr,"[kk] T " __VA_ARGS__); } } while(0)
""",
"""static sInt cViewport, cClear, cSetup, cInstT, cInstP, cDraw, cDrawEmpty, cGeoEnd;
static sInt kkObsOriginOp=-1,kkObsOriginClass=-1,kkObsOriginResult=-1;
static sInt kkObsJobId=-1,kkObsUsage=-1,kkObsRenderPass=-1,kkObsProgram=-1;
static sInt kkObsVertices,kkObsIndices;
extern "C" void kkObsDrawContext(sInt originOp,sInt originClass,sInt originResult,
                                  sInt jobId,sInt usage,sInt renderPass,sInt program,
                                  sInt vertices,sInt indices)
{
  kkObsOriginOp=originOp; kkObsOriginClass=originClass; kkObsOriginResult=originResult;
  kkObsJobId=jobId; kkObsUsage=usage; kkObsRenderPass=renderPass; kkObsProgram=program;
  kkObsVertices=vertices; kkObsIndices=indices;
}
#define KKTRACE(...) do { if(gTraceLeft>0) { gTraceLeft--; fprintf(stderr,"[kk] T " __VA_ARGS__); } } while(0)
""")

replace_once("wasm/_start_wasm.cpp",
"""  cDraw++;
  KKTRACE("draw h=%d mode=%x fvf=%d vc=%d ic=%d setup=%d | sten=%d func=%d ref=%d ops=%d/%d/%d two=%d ccw=%d/%d/%d cw=%x zw=%d zf=%d cull=%d blend=%d/%d/%d op=%d at=%d/%d/%d\\n",
""",
"""  cDraw++;
  {
    static sInt obsDraw;
    if(obsDraw++ < 512)
      fprintf(stderr,"[kk-forensics] {\\\"stage\\\":\\\"gpu.draw\\\",\\\"originOp\\\":%d,\\\"originClass\\\":%d,\\\"originResult\\\":%d,\\\"jobId\\\":%d,\\\"usage\\\":%d,\\\"renderPass\\\":%d,\\\"program\\\":%d,\\\"vertices\\\":%d,\\\"indices\\\":%d,\\\"geometryHandle\\\":%d,\\\"setup\\\":%d,\\\"renderTarget\\\":%d,\\\"viewport\\\":[%d,%d,%d,%d]}\\n",
              kkObsOriginOp,kkObsOriginClass,kkObsOriginResult,kkObsJobId,kkObsUsage,kkObsRenderPass,kkObsProgram,
              kkObsVertices,kkObsIndices,handle,CurrentSetupId,CurrentViewport.RenderTarget,
              CurrentViewport.Window.x0,CurrentViewport.Window.y0,
              CurrentViewport.Window.x0+ViewportX,CurrentViewport.Window.y0+ViewportY);
  }
  KKTRACE("draw h=%d mode=%x fvf=%d vc=%d ic=%d setup=%d | sten=%d func=%d ref=%d ops=%d/%d/%d two=%d ccw=%d/%d/%d cw=%x zw=%d zf=%d cull=%d blend=%d/%d/%d op=%d at=%d/%d/%d\\n",
""")

print("Krieger Total Control forensics patch: PASS")
