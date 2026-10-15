#!/usr/bin/env python3
"""Natural Chromium regression for Moonmoth telegraph, balance and dodge."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

PROBE = r"""
() => {
  const I = window.__isle;
  function flatSpot() {
    const W = I.world;
    for (const [x,z] of W.landCells) {
      if (x < 5 || z < 5 || x > 58 || z > 58) continue;
      const h = W.stand[x + z * 64];
      if (h < 5 || h > 12) continue;
      let flat = true;
      for (let dx=-3; dx<=3 && flat; dx++) for (let dz=-3; dz<=3; dz++)
        if (W.stand[x+dx+(z+dz)*64] !== h) flat = false;
      if (flat) return [x,z];
    }
    return [Math.floor(W.spawn.x), Math.floor(W.spawn.z)];
  }
  function trial(type, moveX) {
    I.rebuild(1337, 'dusk'); I.startGame(); I.setTod(0.8); I.noEvents(true);
    I.G.spawnT = 1e9;
    const [x,z] = flatSpot(), ox=x+0.5, oz=z+0.5, P=I.player;
    I.teleport(ox, oz); I.killFoes(); P.hp=40; P.maxHp=40; P.invuln=0;
    const f=I.foeNear(type, 3.5, 0);
    if (!f) return {error: `${type} did not spawn`};
    const initialHits=I.G.hits, initialHp=P.hp;
    let windupFrames=0, dives=0, dodges=0, maxTargetDrift=0;
    let previous=f.attackMode, diveHits=0, lock=null;
    for (let i=0; i<1200; i++) {
      I.sim(1/60, moveX, 0, false, false);
      if (f.attackMode === 'windup') windupFrames++;
      if (f.attackMode === 'dive') {
        dives++;
        if (previous !== 'dive') { lock=[f.aimX,f.aimZ]; diveHits=I.G.hits; }
        maxTargetDrift=Math.max(maxTargetDrift,
          Math.hypot(f.target.x-lock[0],f.target.z-lock[1]));
      }
      if (previous === 'dive' && f.attackMode !== 'dive' && I.G.hits === diveHits) dodges++;
      previous=f.attackMode;
    }
    return {type, hits:I.G.hits-initialHits, hpDelta:initialHp-P.hp,
      windupFrames, dives, dodges, maxTargetDrift:+maxTargetDrift.toFixed(6),
      game:I.G.state, errors:I.registry().errors};
  }
  return {stationary:trial('moon_moth',0), sidestep:trial('moon_moth',1),
    imp:trial('imp',0)};
}
"""

SHOT = r"""
(tod) => {
  const I=window.__isle;
  I.rebuild(1337,'dusk'); I.startGame(); I.setTod(tod); I.noEvents(true);
  I.G.spawnT=1e9; const W=I.world;
  const x=Math.floor(W.spawn.x)+0.5,z=Math.floor(W.spawn.z)+0.5;
  I.teleport(x,z); I.killFoes();
  const moth=I.foeNear('moon_moth',3.5,0), imp=I.foeNear('imp',5.4,1.2);
  for(let i=0;i<360 && moth.attackMode!=='windup';i++) I.sim(1/60,0,0,false,false);
  return {moth:moth.attackMode, imp:!!imp, errors:I.registry().errors};
}
"""


async def run_viewport(viewport, label):
    async with Game(viewport=viewport, mobile=(label == 'mobile')) as game:
        await game.title()
        result = await game.js(PROBE)
        problems = game.problems()
        print(label, 'MOONMOTH LIVE:', result)
        print(label, 'CONSOLE:', problems[:6])
        for name in ('stationary', 'sidestep', 'imp'):
            assert 'error' not in result[name], result[name]
            assert not result[name]['errors'], result[name]
        still, dodge, imp = result['stationary'], result['sidestep'], result['imp']
        assert still['windupFrames'] >= 20, 'warning shorter than 1/3 second'
        assert still['dives'] > 0 and still['maxTargetDrift'] == 0, 'dive aim not committed'
        assert 1 <= still['hits'] <= 3, 'stationary balance band is 1..3 hits'
        assert still['hits'] <= imp['hits'] + 1, 'moth exceeds comparable imp pressure'
        assert still['hpDelta'] == still['hits'] > 0, 'real HP loss does not match contacts'
        assert dodge['dodges'] >= 1 and dodge['hits'] < still['hits'], 'sidestep is not useful'
        assert not problems, 'browser console errors'
        for tod, light in ((0.55, 'dusk'), (0.8, 'night')):
            scene = await game.js(SHOT, tod)
            assert scene['moth'] == 'windup' and scene['imp'], scene
            await game.frames(1)
            await game.shot(os.path.join('work', f'moonmoth_{label}_{light}.png'))
        return result


async def main():
    desktop = await run_viewport((960, 540), 'desktop')
    mobile = await run_viewport((390, 844), 'mobile')
    print('PASS: Chromium committed telegraph, HP, balance, dodge, desktop/mobile shots')
    print({'desktop': desktop, 'mobile': mobile})


if __name__ == '__main__':
    asyncio.run(main())

