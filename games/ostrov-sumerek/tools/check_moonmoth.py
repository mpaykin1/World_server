#!/usr/bin/env python3
"""Natural Chromium regression for Moonmoth telegraph, balance and dodge."""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

PROBE = r"""
(opts) => {
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
  const {type, sidestep} = opts;
  I.rebuild(1337, 'dusk'); I.startGame(); I.setTod(0.8); I.noEvents(true);
  I.G.spawnT = 1e9;
  const [x,z] = flatSpot(), ox=x+0.5, oz=z+0.5, P=I.player;
  I.teleport(ox, oz); I.killFoes();
  P.hp=40; P.maxHp=40; P.invuln=0;
  const f=I.foeNear(type, 3.5, 0);
  if (!f) return {error: `${type} did not spawn`};
  const initialHits=I.G.hits, initialHp=P.hp;
  let windupFrames=0, dives=0, dodges=0, maxTargetDrift=0;
  let previousDive=false, diveHits=0, lock=null, maxLateral=0;
  let evadeFrames=0, evadeDir=-1;
  for (let i=0; i<1200; i++) {
    const modeBefore=f.attackMode;
    const lateral = evadeFrames > 0 ? evadeDir : 0;
    if (evadeFrames > 0) evadeFrames--;
    I.sim(1/60, 0, lateral, false, false);
    maxLateral=Math.max(maxLateral, Math.abs(P.pos.z-oz));
    if (sidestep && f.attackMode === 'windup' && modeBefore !== 'windup') {
      evadeFrames=45; evadeDir=-evadeDir;
    }
    if (f.attackMode === 'windup') windupFrames++;
    const activeDive=f.state === 'chase' && f.attackMode === 'dive';
    if (activeDive) {
      dives++;
      if (!previousDive) { lock=[f.aimX,f.aimZ]; diveHits=I.G.hits; }
      maxTargetDrift=Math.max(maxTargetDrift,
        Math.hypot(f.target.x-lock[0],f.target.z-lock[1]));
    }
    if (previousDive && !activeDive && I.G.hits === diveHits) dodges++;
    previousDive=activeDive;
  }
  return {type, hits:I.G.hits-initialHits, hpDelta:initialHp-P.hp,
    windupFrames, dives, dodges, maxLateral:+maxLateral.toFixed(3),
    maxTargetDrift:+maxTargetDrift.toFixed(6),
    game:I.G.state, errors:I.registry().errors};
}
"""

SHOT_PREP = r"""
(tod) => {
  const I=window.__isle;
  I.rebuild(1337,'dusk'); I.startGame(); I.setTod(tod); I.noEvents(true);
  I.G.spawnT=1e9; const W=I.world;
  let x=Math.floor(W.spawn.x)+0.5,z=Math.floor(W.spawn.z)+0.5;
  for (const [cx,cz] of W.landCells) {
    if (cx<5 || cz<5 || cx>58 || cz>58) continue;
    const h=W.stand[cx+cz*64];
    if (h<5 || h>12) continue;
    let flat=true;
    for(let dx=-3;dx<=3 && flat;dx++) for(let dz=-3;dz<=3;dz++)
      if(W.stand[cx+dx+(cz+dz)*64]!==h) flat=false;
    if(flat){x=cx+0.5;z=cz+0.5;break;}
  }
  I.teleport(x,z); I.killFoes(); I.foes.length=0;
  I.rig.yaw=I.rig.yawT=0;
  I.rig.pitch=I.rig.pitchT=0.48;
  I.rig.dist=I.rig.distT=innerWidth<500?8.4:7.0;
  I.rig.eff=I.rig.dist; I.rig.blend=1;
  const loading=document.getElementById('loading');
  const loadingHidden=!loading || loading.classList.contains('gone') ||
    getComputedStyle(loading).display==='none' || Number(getComputedStyle(loading).opacity)===0;
  return {game:I.G.state, loadingHidden, errors:I.registry().errors};
}
"""

SHOT = r"""
() => {
  const I=window.__isle;
  const moth=I.foeNear('moon_moth',2.8,0);
  for(let i=0;i<360 && moth.attackMode!=='windup';i++) I.sim(1/60,0,0,false,false);
  for(let i=0;i<12 && moth.attackMode==='windup' &&
      0.5+0.5*Math.sin(moth.t*22)<0.92;i++) I.sim(1/60,0,0,false,false);
  const imp=I.foeNear('imp',-2.8,0.7);
  const toast=document.getElementById('toast');
  const introHidden=I.G.toastT<=0 &&
    (!toast || !toast.classList.contains('show'));
  return {moth:moth.attackMode, imp:!!imp, game:I.G.state,
    introHidden, playTime:I.G.play, cameraDistance:I.rig.dist,
    errors:I.registry().errors};
}
"""


async def run_viewport(viewport, label):
    async with Game(viewport=viewport, mobile=(label == 'mobile')) as game:
        async def fresh(script, arg):
            await game.page.reload()
            await game.title()
            await game.page.wait_for_function(
                """() => {
                  const loading=document.getElementById('loading');
                  return !loading || loading.classList.contains('gone') ||
                    getComputedStyle(loading).display === 'none' ||
                    Number(getComputedStyle(loading).opacity) === 0;
                }""",
                timeout=60000,
            )
            return await game.js(script, arg)

        result = {
            'stationary': await fresh(PROBE, {'type': 'moon_moth', 'sidestep': False}),
            'sidestep': await fresh(PROBE, {'type': 'moon_moth', 'sidestep': True}),
            'imp': await fresh(PROBE, {'type': 'imp', 'sidestep': False}),
        }
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
        assert dodge['maxLateral'] >= 1.5, 'sidestep input did not move the hero'
        assert dodge['dodges'] >= 1 and dodge['hits'] < still['hits'], 'sidestep is not useful'
        assert not problems, 'browser console errors'
        for tod, light in ((0.55, 'dusk'), (0.8, 'night')):
            prep = await fresh(SHOT_PREP, tod)
            assert prep['game'] == 'play' and prep['loadingHidden'], prep
            assert not prep['errors'], prep
            await game.page.wait_for_function(
                """() => {
                  const I=window.__isle, toast=document.getElementById('toast');
                  return I.G.play >= 3.6 && I.G.toastT <= 0 &&
                    (!toast || !toast.classList.contains('show'));
                }""",
                timeout=120000,
            )
            scene = await game.js(SHOT)
            assert scene['game'] == 'play' and scene['introHidden'], scene
            assert scene['playTime'] >= 3.6 and scene['cameraDistance'] <= 8.5, scene
            assert scene['moth'] == 'windup' and scene['imp'], scene
            await game.frames(2)
            await game.shot(os.path.join('work', f'moonmoth_{label}_{light}.png'))
        started = time.perf_counter()
        await game.frames(120)
        elapsed = time.perf_counter() - started
        heap = await game.js("() => performance.memory ? performance.memory.usedJSHeapSize : null")
        runtime = {
            'renderFps120': round(120 / elapsed, 1),
            'usedJsHeapMb': round(heap / 1048576, 1) if heap else None,
        }
        print(label, 'RUNTIME:', runtime)
        return {'combat': result, 'runtime': runtime}


async def main():
    desktop = await run_viewport((960, 540), 'desktop')
    mobile = await run_viewport((390, 844), 'mobile')
    print('PASS: Chromium committed telegraph, HP, balance, dodge, desktop/mobile shots')
    print({'desktop': desktop, 'mobile': mobile})


if __name__ == '__main__':
    asyncio.run(main())

