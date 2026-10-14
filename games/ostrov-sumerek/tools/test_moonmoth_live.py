#!/usr/bin/env python3
"""Chromium regression: the Moonmoth must physically damage an idle hero.

Run after build: python3 tools/test_moonmoth_live.py
Uses the real browser harness, foe brain/body, collision and hurt().
Does not teleport the foe after spawning, or call hurt() directly.
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game  # noqa: E402
from shots import SETUP  # noqa: E402


SPAWN = """() => {
  const I = window.__isle, P = I.player;
  I.killFoes();
  for (const f of I.foes) f.alpha = 0;
  I.G.spawnT = 1e9;
  I.noEvents(true);
  P.maxHp = 30; P.hp = 30; P.invuln = 0; P.respawn = 0;
  const f = I.foeNear('moon_moth', 2, 0, false);
  if (!f) throw Error('moon_moth failed to spawn');
  return { beforeHp: P.hp, start: [f.segs[0].x, f.segs[0].y, f.segs[0].z] };
}"""

SIM = """() => {
  const I = window.__isle, P = I.player, f = I.foes.find(x => x.type === 'moon_moth');
  if (!f) throw Error('moon_moth missing');
  let hits = 0, firstHit = null, minD = 999, orbit = 0, dive = 0, flee = 0;
  let hp = P.hp;
  const dt = 1 / 60;
  for (let k = 0; k < 1200; k++) {
    if (I.G.state !== 'play') break;
    // Full engine sim: player physics, foe steering, physical 3D contact, hurt cooldown.
    I.sim(dt, 0, 0, false, true);
    const h = f.segs[0];
    const d = Math.hypot(P.pos.x-h.x, P.pos.y+0.75-h.y, P.pos.z-h.z);
    minD = Math.min(minD, d);
    if (f.attackMode === 'dive') dive++;
    else if (f.state === 'flee') flee++;
    else if (f.attackMode === 'orbit') orbit++;
    if (P.hp < hp) { hits++; if (firstHit === null) firstHit = k * dt; }
    hp = P.hp;
  }
  return { hits, firstHit, minD, orbit, dive, flee, hp: P.hp,
    radius: f.def.rad + 0.35, state: I.G.state };
}"""


async def main():
    async with Game(viewport=(840, 500)) as game:
        await game.title()
        await game.js('window.__isle.startGame()')
        await game.js(SETUP, {'tod': 0.78, 'dist': 7.5})
        setup = await game.js(SPAWN)
        result = await game.js(SIM)
        out = os.path.join('build', 'moonmoth_live.png')
        await game.frames(2)
        await game.shot(out)
        errors = game.problems()
    print('setup:', json.dumps(setup))
    print('live:', json.dumps(result))
    print('screenshot:', out)
    print('errors:', errors[:8])
    assert not errors, 'Chromium console/page errors detected'
    assert result['orbit'] > 0 and result['dive'] > 0, 'missing real orbit/dive phases'
    assert result['hits'] >= 1, 'Moonmoth never damaged the actual hero'
    assert result['flee'] > 0, 'Moonmoth never retreated after hitting the hero'
    assert result['firstHit'] < 12, 'the first real bite took too long'
    assert result['minD'] < result['radius'], 'foe never entered its 3D contact radius'
    print('PASS: real Chromium hero HP lost, body contact, orbit/dive, no console errors')


if __name__ == '__main__':
    asyncio.run(main())
