// Real browser smoke for self-hosted Telegram Scratch Mini App.
// Run: PLAYWRIGHT_MODULE=/path/to/playwright node test/telegram-miniapp.e2e.cjs
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),out=process.env.SCREENSHOT_DIR||require('node:os').tmpdir();
const file=path.join(root,'apps/telegram-miniapp/game.html');
assert(fs.statSync(file).size>100000,'Packaged Scratch game missing');
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://local/').pathname.replace(/^\/+/,'');
 const target=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{
  const data=fs.readFileSync(target);
  res.writeHead(200,{'content-type':target.endsWith('.json')?'application/json':
    target.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream',
   'cache-control':'no-store'});
  res.end(data);
 }catch{res.writeHead(404).end();}
});
async function verify(browser,kind,config){
 const context=await browser.newContext(config),page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+
   '/apps/telegram-miniapp/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('#loading')?.hidden,{timeout:45000});
 const frame=page.frameLocator('#game');
 await frame.locator('canvas').first().waitFor({state:'visible',timeout:45000});
 await page.waitForTimeout(1500);
 const info=await page.evaluate(()=>{
  const iframe=document.querySelector('#game'),c=iframe.getBoundingClientRect();
  return{frameWidth:c.width,frameHeight:c.height,viewportWidth:innerWidth,
    viewportHeight:innerHeight,horizontalOverflow:
      document.documentElement.scrollWidth>innerWidth+2,loadingHidden:
      document.querySelector('#loading').hidden};
 });
 const stage=await frame.locator('canvas').first().evaluate(c=>{
  const r=c.getBoundingClientRect();return{width:r.width,height:r.height,
   pixelsWidth:c.width,pixelsHeight:c.height};});
 assert(info.loadingHidden&&stage.width>100&&stage.height>100,
   kind+': game failed to render real canvas');
 assert(!info.horizontalOverflow,kind+': horizontal overflow');
 assert(info.frameWidth>=info.viewportWidth*.95,kind+': stage not fullscreen width');
 assert(info.frameHeight>=info.viewportHeight*.65,kind+': game too small');
 assert.equal(errors.length,0,kind+': JavaScript runtime errors '+errors.join(';'));
 const screenshot=path.join(out,'world-server-telegram-'+kind+'.png');
 await page.screenshot({path:screenshot,fullPage:true});
 console.log('MINIAPP_BROWSER_PASS',kind,JSON.stringify(info),JSON.stringify(stage),
   screenshot);
 await context.close();
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,channel:'chrome',
   args:['--use-gl=angle','--use-angle=swiftshader']});
 try{
  await verify(browser,'desktop',{viewport:{width:1280,height:800}});
  await verify(browser,'mobile',{...devices['iPhone 12'],browserName:undefined});
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error('MINIAPP_BROWSER_FAIL',e);process.exitCode=1;
 try{server.close()}catch{}});
