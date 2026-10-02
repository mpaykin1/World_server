const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');

const base = process.argv[2] || process.env.TRINITY_URL || 'http://127.0.0.1:3107/apps/trinity-lab/';
const output = process.argv[3] || 'test-results/trinity-evidence.json';

function frameMetrics(buffer) {
  const png=PNG.sync.read(buffer),lum=[],n=png.width*png.height;
  let dark=0,warm=0,highlight=0,nonDark=0;
  for(let i=0;i<png.data.length;i+=4){
    const r=png.data[i],g=png.data[i+1],b=png.data[i+2],y=.2126*r+.7152*g+.0722*b;
    lum.push(y);if(y<32)dark++;if(y>24)nonDark++;if(y>145)highlight++;
    if(r>95&&r>g*1.08&&g>b*1.08)warm++;
  }
  lum.sort((a,b)=>a-b);const q=p=>lum[Math.min(lum.length-1,Math.floor(lum.length*p))]||0;
  return {darkRatio:dark/n,nonDarkRatio:nonDark/n,warmRatio:warm/n,highlightRatio:highlight/n,p10:q(.10),p50:q(.50),p95:q(.95),contrast:q(.95)-q(.10)};
}

async function probe(browser, name, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.stack || error.message)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trinityLab?.getDebug);
  await page.waitForTimeout(1600);
  const krieger = await page.evaluate(() => window.__trinityLab.getDebug());
  const shot=await page.screenshot({type:'png'});
  const frame=frameMetrics(shot);
  const shotPath=output.replace(/\.json$/,`-${name}-krieger.png`);
  fs.mkdirSync(path.dirname(shotPath),{recursive:true});fs.writeFileSync(shotPath,shot);
  await page.evaluate(() => { window.__trinityLab.setMode('INK'); window.__trinityLab.moveCamera(.25,.15); });
  await page.waitForTimeout(900);
  const ink = await page.evaluate(() => window.__trinityLab.getDebug());
  const cube0 = await page.evaluate(() => { window.__trinityLab.setMode('CUBE'); return window.__trinityLab.restartCube(); });
  const cube46 = await page.evaluate(() => window.__trinityLab.setCubeProgress(.46));
  const cube1 = await page.evaluate(() => window.__trinityLab.setCubeProgress(1));
  await page.waitForTimeout(120);
  const cubeFinal = await page.evaluate(() => window.__trinityLab.getDebug());
  await context.close();
  return { name, httpStatus: response.status(), errors, krieger, frame, ink, cube0, cube46, cube1, cubeFinal };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await probe(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
  const mobile = await probe(browser, 'mobile-portrait', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await browser.close();
  const evidence = { url: base, measuredAt: new Date().toISOString(), desktop, mobile };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  const requiredKriegerGates = ['DEPTH_GATE','NEAR_OBJECT_GATE','MATERIAL_GATE','LIGHTING_GATE','ENVIRONMENT_GATE','ARCHITECTURAL_RHYTHM_GATE','MICRODETAIL_GATE','HERO_FOREGROUND_GATE','CONTROLLED_DARKNESS_GATE','MATERIAL_LIGHT_COUPLING_GATE'];
  const framePass = x => x.frame.nonDarkRatio>=.22 && x.frame.darkRatio>=.08 && x.frame.darkRatio<=.82 &&
    x.frame.warmRatio>=.004 && x.frame.highlightRatio>=.004 && x.frame.contrast>=55;
  const bad = [desktop, mobile].some(x =>
    x.httpStatus !== 200 || x.errors.length || x.krieger.visibility < 85 ||
    requiredKriegerGates.some(gate => x.krieger.gates?.[gate] !== true) ||
    x.krieger.metrics?.drawCalls > 180 || x.krieger.metrics?.triangles > 700000 ||
    !framePass(x) ||
    x.ink.gates?.SEMANTIC_INK_GATE !== 'PASS' ||
    x.cubeFinal.gates?.FINAL_SEMANTIC_EQUIVALENCE_GATE !== 'PASS'
  );
  if (bad) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
