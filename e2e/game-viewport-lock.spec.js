const {test,expect}=require('@playwright/test');
const path=require('path');

test.describe('GAME_VIEWPORT_LOCK_GATE',()=>{
  test('finger input moves game input but never the page',async({page})=>{
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>#game-root{position:fixed;inset:0;background:#111}canvas{display:block;width:100%;height:100%;background:#222}.noise{height:4000px;width:10px}</style></head><body><div id="game-root"><canvas id="game"></canvas><div class="noise"></div></div></body></html>');
    await page.addStyleTag({path:path.resolve('shared/world-server-game-viewport.css')});
    await page.addScriptTag({path:path.resolve('shared/world-server-game-viewport.js')});
    await page.waitForFunction(()=>window.WorldServerGameViewport?.state.ready===true);

    await page.evaluate(()=>{
      const canvas=document.querySelector('#game');
      window.__gameInput=0;
      canvas.addEventListener('pointermove',()=>window.__gameInput++);
      const points=[[120,320],[120,140],[120,320],[40,230],[200,230]];
      canvas.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,pointerType:'touch',clientX:120,clientY:230,bubbles:true,cancelable:true}));
      for(const [x,y] of points) canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:7,pointerType:'touch',clientX:x,clientY:y,bubbles:true,cancelable:true}));
      canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,pointerType:'touch',clientX:200,clientY:230,bubbles:true,cancelable:true}));
      window.scrollTo(0,500);
    });
    await page.waitForTimeout(50);

    const result=await page.evaluate(()=>({x:scrollX,y:scrollY,input:window.__gameInput,qa:window.WorldServerGameViewport.snapshot()}));
    expect(result.input).toBeGreaterThan(0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.qa.checks.documentHeight).toBe(true);
    expect(result.qa.checks.overflowHidden).toBe(true);
    expect(result.qa.checks.touchActionNone).toBe(true);
    expect(result.qa.checks.canvasCss).toBe(true);
    expect(result.qa.checks.drawingBuffer).toBe(true);
  });

  test('production-shaped app receives the universal shell',async({page})=>{
    await page.goto('/apps/chain-reaction-meta6-living-relations/');
    await page.waitForFunction(()=>window.WorldServerGameViewport?.state.ready===true);
    const result=await page.evaluate(()=>window.WorldServerGameViewport.snapshot());
    expect(result.checks.documentHeight).toBe(true);
    expect(result.checks.scrollZero).toBe(true);
    expect(result.checks.overflowHidden).toBe(true);
    expect(result.checks.touchActionNone).toBe(true);
    expect(result.checks.canvasCss).toBe(true);
  });
});
