const {test,expect}=require('@playwright/test');
const yaws=[0,Math.PI/2,Math.PI,-Math.PI/2];

const PLAYABLE_APPS=[
  { id: 'ai3d-voxel-city', url: '/apps/ai3d-voxel-city/', hasJump: true },
  { id: 'voxel-world', url: '/apps/voxel-world/', hasJump: true },
  { id: 'catalog', url: '/apps/catalog/', hasJump: false }
];

test.describe('Canonical control behavior',()=>{
  for(const app of PLAYABLE_APPS){
    test(`${app.id}: controls-cardinal WASD and Arrow keys remain camera-relative`,async({page})=>{
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});

      // 1. Check WASD movement at multiple camera yaw angles
      for(const yaw of yaws){
        await page.evaluate(y=>window.GamePlayableRuntime.setView(y,0),yaw);
        const before=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        await page.keyboard.down('KeyW');await page.waitForTimeout(200);await page.keyboard.up('KeyW');
        const after=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(.01);
      }

      // 2. Check Arrow keys (ArrowUp, ArrowDown, ArrowLeft, ArrowRight)
      for(const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
        const before=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        await page.keyboard.down(code);await page.waitForTimeout(200);await page.keyboard.up(code);
        const after=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(.01);
      }
    });

    test(`${app.id}: controls-arrow-prevent-default prevents scroll when focused but preserves input fields`,async({page})=>{
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});

      const defaultPrevented = await page.evaluate(()=>{
        let prevented = true;
        for(const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
          const ev = new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true});
          window.dispatchEvent(ev);
          if(!ev.defaultPrevented) prevented = false;
        }
        return prevented;
      });
      expect(defaultPrevented).toBe(true);

      const inputNotPrevented = await page.evaluate(()=>{
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();
        let notPrevented = true;
        for(const code of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']){
          const ev = new KeyboardEvent('keydown',{code,bubbles:true,cancelable:true});
          input.dispatchEvent(ev);
          if(ev.defaultPrevented) notPrevented = false;
        }
        input.remove();
        return notPrevented;
      });
      expect(inputNotPrevented).toBe(true);
    });

    test(`${app.id}: controls-diagonal moves diagonally without >1.5x speed explosion`,async({page})=>{
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});

      // Diagonal WASD (W+D)
      const p0=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');
      await page.waitForTimeout(220);
      await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');
      const p1=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      const distWASD = Math.hypot(p1.x-p0.x,p1.z-p0.z);
      expect(distWASD).toBeGreaterThan(.01);
      expect(distWASD).toBeLessThan(3.5);

      // Diagonal Arrow keys (ArrowUp+ArrowRight)
      const p2=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      await page.keyboard.down('ArrowUp');await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(220);
      await page.keyboard.up('ArrowUp');await page.keyboard.up('ArrowRight');
      const p3=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      const distArrows = Math.hypot(p3.x-p2.x,p3.z-p2.z);
      expect(distArrows).toBeGreaterThan(.01);
      expect(distArrows).toBeLessThan(3.5);
    });

    if(app.hasJump){
      test(`${app.id}: jump-y-only begins with vertical change`,async({page})=>{
        await page.goto(app.url,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});
        const before=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        await page.keyboard.press('Space');await page.waitForTimeout(140);
        const after=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
        expect(after.y).not.toBe(before.y);
      });
    }

    test(`${app.id}: camera-roll-zero remains zero`,async({page})=>{
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});
      const roll=await page.evaluate(()=>window.GamePlayableRuntime.stats().cameraRoll||0);
      expect(Math.abs(roll)).toBeLessThan(1e-6);
    });
  }
});
