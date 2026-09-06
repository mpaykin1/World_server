const {test,expect}=require('@playwright/test');
const configs=[
 {app:'ai3d-voxel-city',runtime:'AI3DVoxelRuntime',pad:'#goldenMovePad',look:'#goldenLookZone',jump:'#goldenJump'},
 {app:'voxel-world',runtime:'VoxelWorldRuntime',pad:'#movePad',look:'#lookZone',jump:'#jumpBtn'}
];
test('every certified world has an explicit touch behavior contract',()=>{
 const registry=require('../data/app-release-registry.json');
 const certified=Object.entries(registry.apps).filter(([,app])=>app.status==='certified').map(([id])=>id).sort();
 expect(configs.map(c=>c.app).sort()).toEqual(certified);
});
for(const config of configs){
 test(`${config.app}: touch movement, look and vertical jump`,async({page,isMobile,browserName})=>{
  test.skip(!isMobile||browserName!=='chromium','native Chromium touch-event proof');
  await page.goto(`/apps/${config.app}/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(name=>window[name]?.stats().player.onGround,config.runtime);
  await expect(page.locator('#loading')).toBeHidden({timeout:10000});
  const stats=()=>page.evaluate(name=>window[name].stats().player,config.runtime);
  const before=await stats(),cdp=await page.context().newCDPSession(page);
  async function drag(selector,dx,dy){
   const box=await page.locator(selector).boundingBox();expect(box).toBeTruthy();
   const x=box.x+box.width/2,y=box.y+box.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});
   await page.waitForTimeout(350);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await drag(config.pad,0,-42);
  const moved=await stats();expect(Math.hypot(moved.x-before.x,moved.z-before.z)).toBeGreaterThan(.03);
  await drag(config.look,35,10);
  expect(Math.abs((await stats()).yaw-moved.yaw)).toBeGreaterThan(.01);
  const roll=await page.evaluate(name=>window[name].stats().cameraRoll,config.runtime);
  expect(typeof roll).toBe('number');expect(Math.abs(roll)).toBeLessThan(1e-6);
  await page.waitForTimeout(700);
  await page.waitForFunction(name=>window[name].stats().player.onGround,config.runtime);
  const grounded=await stats();await page.locator(config.jump).tap();
  await expect.poll(async()=>(await stats()).y).toBeGreaterThan(grounded.y+.05);
  const jumped=await stats();expect(Math.hypot(jumped.x-grounded.x,jumped.z-grounded.z)).toBeLessThan(.02);
  await cdp.detach();
 });
}
