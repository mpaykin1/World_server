#!/usr/bin/env python3
"""Behavioral regression in the actual Chromium game: a stationary hero must be struck.
Run after build.py: python3 tools/check_moonmoth.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402

PROBE = r"""
() => {
  const I = window.__isle;
  I.rebuild(1337, 'dusk'); I.startGame(); I.setTod(0.8); I.noEvents(true);
  I.G.spawnT = 1e9;
  const W = I.world, P = I.player;
  let spot = [Math.floor(W.spawn.x), Math.floor(W.spawn.z)];
  for (const [x,z] of W.landCells) {
    if (x < 5 || z < 5 || x > 58 || z > 58) continue;
    const height = W.stand[x + z * 64];
    if (height < 5 || height > 12) continue;
    let flat = true;
    for (let dx = -3; dx <= 3 && flat; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (W.stand[x + dx + (z + dz) * 64] !== height) flat = false;
      }
    }
    if (flat) { spot = [x,z]; break; }
  }
  const ox = spot[0] + 0.5, oz = spot[1] + 0.5;
  I.teleport(ox, oz); I.killFoes();
  P.hp = 40; P.maxHp = 40; P.invuln = 0;
  const f = I.foeNear('moon_moth', 3.5, 0);
  if (!f) return { error: 'moon moth did not spawn' };
  let minDist = Infinity, dives = 0, retreats = 0;
  const initialHits = I.G.hits;
  for (let i = 0; i < 1200; i++) {
    I.sim(1 / 60, 0, 0, false, false);
    const h = f.segs[0];
    minDist = Math.min(minDist, Math.hypot(h.x-P.pos.x, h.y-(P.pos.y+0.75), h.z-P.pos.z));
    if (f.attackMode === 'dive') dives++;
    if (f.state === 'flee') retreats++;
    I.teleport(ox, oz); // negate hit knockback: hero stays stationary
  }
  return {
    hits: I.G.hits - initialHits, minDist: Number(minDist.toFixed(3)),
    dives, retreats, radius: Number((f.def.rad + 0.35).toFixed(3)),
    game: I.G.state, errors: I.registry().errors,
  };
}
"""


async def main():
    async with Game(viewport=(960, 540)) as game:
        await game.title()
        result = await game.js(PROBE)
        await game.frames(3)
        await game.shot(os.path.join('work', 'moonmoth_behavior.png'))
        problems = game.problems()
        print('MOONMOTH LIVE:', result)
        print('CONSOLE:', problems[:6])
        assert 'error' not in result, result
        assert result['dives'] > 0, 'never entered dive'
        assert result['hits'] >= 1, 'no successful damage in real gameplay'
        assert result['retreats'] > 0, 'no retreat after contact'
        assert result['minDist'] < result['radius'], 'never reached collision sphere'
        assert not result['errors'] and not problems, 'registry or console errors'
        print('PASS: live Chromium moth dive + damage + retreat')


if __name__ == '__main__':
    asyncio.run(main())
