const { test, expect } = require('@playwright/test');
const { PNG } = require('pngjs');
const policy = require('../data/world-detail-efficiency-policy.json');

function visibleDetailScore(buffer){
  const png=PNG.sync.read(buffer),{width,height,data}=png;
  let edges=0,total=0,energy=0;
  const step=Math.max(1,Math.floor(Math.min(width,height)/240));
  const lum=(x,y)=>{const i=(y*width+x)*4;return data[i]*0.2126+data[i+1]*0.7152+data[i+2]*0.0722;};
  for(let y=0;y<height-step;y+=step){for(let x=0;x<width-step;x+=step){const l=lum(x,y),g=Math.abs(l-lum(x+step,y))+Math.abs(l-lum(x,y+step));energy+=g;if(g>24)edges++;total++;}}
  const edgeDensity=total?edges/total:0,edgeEnergy=total?energy/total/510:0;
  return +Math.min(100,edgeDensity*72+edgeEnergy*28).toFixed(3);
}

test('detail efficiency runtime evidence', async ({ page }, testInfo) => {
  test.skip(!policy.profiles.includes(testInfo.project.name), 'detail-efficiency profiles only');
  await page.goto('/apps/voxel-world/', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.WorldQualityAutopilot?.getState?.().some(s=>s.app==='voxel-world'), {timeout:25000});
  await page.waitForTimeout(policy.sampling.warmupMs);
  const metric = await page.evaluate(async ({project,measureMs}) => {
    const samples=[];
    const started=performance.now();
    let previous=null;
    await new Promise(resolve=>{
      function tick(now){
        if(previous!==null)samples.push(now-previous);
        previous=now;
        if(now-started>=measureMs)return resolve();
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    const elapsed=Math.max(1,performance.now()-started);
    const sorted=samples.filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
    const p95=sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:null;
    const fps=sorted.length*1000/elapsed;
    const states=window.WorldQualityAutopilot?.getState?.()||[];
    const s=states.find(x=>x.app==='voxel-world')||states[0]||{};
    return {...s,fps:+fps.toFixed(2),frameP95Ms:p95==null?null:+p95.toFixed(3),measuredFrames:sorted.length,measurementMs:+elapsed.toFixed(1),project,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},devicePixelRatio:window.devicePixelRatio||1};
  }, {project:testInfo.project.name,measureMs:policy.sampling.measureMs});
  const shot=await page.screenshot({animations:'disabled'});
  metric.visibleDetailScore=visibleDetailScore(shot);
  expect(metric.fps).toBeGreaterThanOrEqual(policy.sampling.minimumFps);
  expect(metric.frameP95Ms).toBeGreaterThan(0);
  expect(metric.detailBudgetScore).toBeGreaterThan(0);
  expect(metric.visibleDetailScore).toBeGreaterThan(0);
  console.log(`DETAIL_EFFICIENCY_METRIC:${JSON.stringify(metric)}`);
});
