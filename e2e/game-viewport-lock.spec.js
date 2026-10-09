const {test,expect}=require('@playwright/test');
const path=require('path');

test.describe('GAME_VIEWPORT_LOCK_GATE',()=>{
  test('native touch swipe scrolls the control page but not the locked game',async({page,browserName,isMobile})=>{
    test.skip(browserName!=='chromium'||!isMobile,'Native Chromium touch input; physical iPhone evidence remains separate.');
    const session=await page.context().newCDPSession(page);
    const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}canvas{display:block;width:100vw;height:100vh}.noise{height:3000px}</style></head><body><canvas id="game"></canvas><div class="noise"></div></body></html>';
    const swipe=async()=>{
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:160,y:550,id:1}]});
      for(const y of [500,450,400,350,300,250]){
        await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:160,y,id:1}]});
        await page.waitForTimeout(20);
      }
      await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForTimeout(100);
    };
    try{
      await page.setContent(html);
      await swipe();
      expect(await page.evaluate(()=>scrollY)).toBeGreaterThan(50);
      await page.setContent(html);
      await page.addStyleTag({path:path.resolve('shared/world-server-game-viewport.css')});
      await page.addScriptTag({path:path.resolve('shared/world-server-game-viewport.js')});
      await page.waitForFunction(()=>window.WorldServerGameViewport?.state.ready===true);
      await page.evaluate(()=>{
        window.__trustedTouchMoves=0;
        document.querySelector('#game').addEventListener('pointermove',event=>{
          if(event.isTrusted&&event.pointerType==='touch')window.__trustedTouchMoves++;
        });
      });
      await swipe();
      const result=await page.evaluate(()=>({x:scrollX,y:scrollY,input:window.__trustedTouchMoves}));
      expect(result.input).toBeGreaterThan(0);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    }finally{await session.detach();}
  });

  test('native UI clicks survive root bootstrap and a later game canvas',async({page,isMobile})=>{
    await page.setContent('<!doctype html><html><body><button id="open" style="position:fixed;left:20px;top:20px;z-index:10;width:180px;height:60px">Open board</button><div id="board" hidden>Board</div></body></html>');
    await page.evaluate(()=>{
      window.__boardClicks=0;
      document.querySelector('#open').addEventListener('click',()=>{
        window.__boardClicks++;
        document.querySelector('#board').hidden=false;
      });
    });
    await page.addStyleTag({path:path.resolve('shared/world-server-game-viewport.css')});
    await page.addScriptTag({path:path.resolve('shared/world-server-game-viewport.js')});
    await page.waitForFunction(()=>window.WorldServerGameViewport?.state.ready===true);
    const openBoard=()=>isMobile?page.locator('#open').tap():page.locator('#open').click();
    await openBoard();
    await expect(page.locator('#board')).toBeVisible();
    await page.evaluate(()=>{
      document.querySelector('#board').hidden=true;
      const canvas=document.createElement('canvas');
      canvas.id='late-game';
      canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%';
      document.body.append(canvas);
      window.WorldServerGameViewport.sync();
    });
    await openBoard();
    await expect(page.locator('#board')).toBeVisible();
    expect(await page.evaluate(()=>window.__boardClicks)).toBe(2);
    expect(await page.evaluate(()=>window.WorldServerGameViewport.state.surface.id)).toBe('late-game');
  });

  test('touch listeners and viewport geometry preserve game input without page movement',async({page})=>{
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
    // Also exercise a browser-level pointer gesture. The synthetic events
    // above validate listener ownership; this gesture exercises mouse input.
    // Native touch scrolling has its own control-page regression above.
    await page.mouse.move(120,230);
    await page.mouse.down();
    await page.mouse.move(120,140);
    await page.mouse.up();
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
    expect(result.qa.checks.webglViewport).toBe(true);
  });

  test('touchmove listeners block game gestures and exempt isolated scroll UI',async({page})=>{
    await page.setContent('<!doctype html><html><body><canvas id="game" style="width:100vw;height:100vh"></canvas><div id="modal" data-world-server-scroll style="position:fixed;inset:20px;overflow:auto"><div style="height:2000px"></div></div></body></html>');
    await page.addStyleTag({path:path.resolve('shared/world-server-game-viewport.css')});
    await page.addScriptTag({path:path.resolve('shared/world-server-game-viewport.js')});
    await page.waitForFunction(()=>window.WorldServerGameViewport?.state.ready===true);
    const result=await page.evaluate(()=>{
      const game=document.querySelector('#game');
      const modal=document.querySelector('#modal');
      const blocked=new Event('touchmove',{bubbles:true,cancelable:true});
      game.dispatchEvent(blocked);
      const allowed=new Event('touchmove',{bubbles:true,cancelable:true});
      modal.dispatchEvent(allowed);
      return {gameBlocked:blocked.defaultPrevented,modalAllowed:!allowed.defaultPrevented};
    });
    expect(result.gameBlocked).toBe(true);
    expect(result.modalAllowed).toBe(true);
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
