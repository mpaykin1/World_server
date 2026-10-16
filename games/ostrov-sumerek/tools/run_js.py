#!/usr/bin/env python3
"""Run a JS expression/function in the game page and print the JSON result.
usage: python3 tools/run_js.py [--start] [--biome ID] [--seed N] FILE.js|'() => expr'
  --start   start a run first (and give no weapons)
The function may be async; window.__isle is the debug handle (see docs/ENGINE.md)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib.harness import Game, run, dumps  # noqa: E402


async def main():
    args = sys.argv[1:]
    start = "--start" in args
    biome = seed = None
    if "--biome" in args:
        biome = args[args.index("--biome") + 1]
    if "--seed" in args:
        seed = int(args[args.index("--seed") + 1])
    code = [a for a in args if not a.startswith("--") and a not in (biome, str(seed))][-1]
    if os.path.isfile(code):
        code = open(code).read()
    async with Game(viewport=(640, 360)) as g:
        await g.title()
        if biome or seed is not None:
            await g.js(f"window.__isle.rebuild({seed if seed is not None else 1337}, {repr(biome) if biome else 'undefined'})")
        if start:
            await g.js("window.__isle.startGame()")
        res = await g.js(code)
        print(dumps(res))
        for p in g.problems()[:10]:
            print("PROBLEM:", p)


run(main())
