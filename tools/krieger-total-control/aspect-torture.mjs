#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";
import { analyzeForensics } from "./observatory-core.mjs";

const base = process.env.KK_URL || "http://127.0.0.1:8765/kkrieger.html?res=fit";
const requireResponsive = process.env.KK_REQUIRE_RESPONSIVE === "1";
const outPath = process.env.KK_TORTURE_REPORT || "KRIEGER_ASPECT_TORTURE_REPORT.json";

const cases = [
  {id:"16:9",width:1280,height:720},
  {id:"19.5:9",width:844,height:390},
  {id:"4:3",width:1024,height:768},
  {id:"1:1",width:800,height:800},
  {id:"9:16",width:450,height:800},
  {id:"narrow_portrait",width:320,height:900},
];

const browser = await chromium.launch({
  headless:true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"],
});

const results=[];
let fatal=null;
try {
  for (const c of cases) {
    const context=await browser.newContext({viewport:{width:c.width,height:c.height},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    page.on("console",m=>{ if(m.type()==="error") errors.push(m.text()); });
    const join=base.includes("?") ? "&" : "?";
    await page.goto(base+join+"torture="+encodeURIComponent(c.id),{waitUntil:"domcontentloaded",timeout:120000});
    await page.waitForFunction(()=>window.__kkForensics && window.__kkForensics.some(x=>x.stage==="lifecycle.runtime_initialized"),null,{timeout:60000});
    await page.locator("#start").click();
    await page.waitForFunction(()=>window.__kkForensics.some(x=>x.stage==="mainplayer.master_viewport"),null,{timeout:90000});
    await page.waitForFunction(()=>window.__kkForensics.some(x=>x.stage==="engine.set_viewport.before"),null,{timeout:30000});
    await page.waitForFunction(()=>window.__kkForensics.some(x=>x.stage==="renderer.frame"),null,{timeout:30000});
    await page.waitForFunction(()=>window.__kkForensics.some(x=>x.stage==="gpu.frame"),null,{timeout:30000});
    await page.waitForFunction(()=>window.__kkForensics.some(x=>x.stage==="geometry.mesh") && window.__kkForensics.some(x=>x.stage==="material.pass"),null,{timeout:30000});
    await page.waitForTimeout(250);
    const events=await page.evaluate(()=>window.__kkForensics.slice());
    const analysis=analyzeForensics(events);
    const stages=[...new Set(events.map(x=>x.stage))];
    const mustHave=[
      "browser.viewport","engine.screen","mainplayer.master_viewport",
      "mainplayer.projection_aspect","engine.set_viewport.before",
      "geometry.mesh","material.pass","renderer.frame","gpu.frame","data.document"
    ];
    const missing=mustHave.filter(x=>!stages.includes(x));
    if(missing.length) throw new Error(c.id+" missing forensic stages: "+missing.join(", "));
    if(requireResponsive && c.height>c.width && analysis.viewport.forcedTwoToOne) {
      throw new Error(c.id+" still forces a 2:1 master viewport");
    }
    const screenshot=process.env.KK_TORTURE_SHOTS;
    let screenshotError=null;
    if(screenshot) {
      fs.mkdirSync(screenshot,{recursive:true});
      try {
        // The live WebGL compositor can stall a full-page capture in headless
        // Chromium. A canvas capture is smaller and remains evidence-only:
        // telemetry, not PNG export, is the diagnostic gate.
        await page.locator("canvas").screenshot({
          path:`${screenshot}/${c.id.replace(/[^a-z0-9]+/gi,"_")}.png`,
          timeout:15000,
        });
      } catch(e) {
        screenshotError=String(e?.message||e);
      }
    }
    results.push({
      case:c,
      analysis,
      stages,
      observatory:{
        assetSamples:analysis.assets.meshSamples,
        materialPassSamples:analysis.assets.materialPassSamples,
        scene:analysis.scene,
        renderer:analysis.renderer,
        data:analysis.data,
        game:analysis.game,
      },
      screenshotError,
      errors:errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x)),
    });
    await context.close();
  }
} catch(e) {
  fatal=String(e?.stack||e);
} finally {
  await browser.close();
}

const report={
  generatedAt:new Date().toISOString(),
  url:base,
  mode:requireResponsive ? "responsive_acceptance" : "diagnostic",
  pass:!fatal && results.every(x=>x.errors.length===0),
  fatal,
  cases:results,
  localization:{
    knownPortraitPolicyDetected:results.filter(x=>x.case.height>x.case.width).some(x=>x.analysis.viewport.forcedTwoToOne),
    rule:"diagnostic mode passes when telemetry is coherent; responsive_acceptance additionally fails on the pinned 2:1 portrait policy"
  }
};
fs.writeFileSync(outPath,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(!report.pass) process.exitCode=1;
