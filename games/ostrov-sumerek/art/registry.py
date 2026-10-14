"""
Art registry: pack art modules register drawing functions with decorators; art/build.py
runs them all and packs the results into atlases + metadata for the engine.

    from art.registry import tile, weapon, projectile, icon, hero, strip_art

    @tile("snow")                      # 16×16 seamless tile → ASSETS.atlas / atlasNames
    def snow(): return array16x16

    @weapon("boomerang")               # 32×32 cell, returns (array, dict(grip, tip, muzzle?, base))
    def boomerang(): ...

    @projectile("boomerang")           # 16×16 sprite → wmeta.proj[name]
    @icon("relic_compass")             # 16×16 icon (relics, items) → wmeta.icons[name]
    @hero("keeper")                    # 6-frame 16×24 strip → ASSETS.heroes[name]
    @strip_art("coin")                 # any special strip (coin spin, hearts, water)
"""
TILES, WEAPONS, PROJECTILES, ICONS, HEROES, STRIPS = {}, {}, {}, {}, {}, {}
ORIGIN = {}          # name -> pack id (for error messages / docs)
_current_pack = ["?"]


def set_pack(pid):
    _current_pack[0] = pid


def _reg(table, kind, name):
    def deco(fn):
        if name in table:
            raise ValueError(f"art: {kind} '{name}' defined twice ({ORIGIN.get((kind, name))} and {_current_pack[0]})")
        table[name] = fn
        ORIGIN[(kind, name)] = _current_pack[0]
        return fn
    return deco


def tile(name):
    return _reg(TILES, "tile", name)


def weapon(name):
    return _reg(WEAPONS, "weapon", name)


def projectile(name):
    return _reg(PROJECTILES, "projectile", name)


def icon(name):
    return _reg(ICONS, "icon", name)


def hero(name):
    return _reg(HEROES, "hero", name)


def strip_art(name):
    return _reg(STRIPS, "strip", name)
