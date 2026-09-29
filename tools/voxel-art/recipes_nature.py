"""Natural high-detail voxel recipes: earth, forest, volcano and river."""
from __future__ import annotations
import math

from recipe_core import Recipe, stable_hash


def _root(r: Recipe) -> str:
    return r.feature("root", r.kind, None, 1, gameplay={"semanticRoot": True})


def _terrain_block(r: Recipe, radius: int = 11, top_kind: str = "grass") -> str:
    root = _root(r)
    strata = [
        (-3, "stone", "strata:bedrock"), (-2, "dirt_dark", "strata:subsoil"),
        (-1, "dirt", "strata:soil"), (0, top_kind, "surface"),
    ]
    for z, material, suffix in strata:
        f = r.feature(suffix, "strata" if "strata" in suffix else "terrainSurface", root, 1,
                      gameplay={"walkable": z == 0})
        for x in range(-radius, radius + 1):
            for y in range(-radius, radius + 1):
                # Corner erosion keeps the block from reading as a perfect square.
                if abs(x) + abs(y) > radius * 2 - 2 and stable_hash(r.seed, x, y, z) % 3:
                    continue
                r.put(x, y, z, material, f)
    return root


def _rock(r: Recipe, suffix: str, x: int, y: int, z: int, radius: int, parent: str, detail: int = 3) -> str:
    f = r.feature(suffix, "rock", parent, detail, gameplay={"scatter": "rock"})
    rx = max(1, radius)
    r.sphere(x, y, z, rx, max(1, radius - 1), max(1, radius - 1), r.tone("stone", x, y, z, suffix), f)
    return f


def _plant(r: Recipe, suffix: str, x: int, y: int, z: int, parent: str, detail: int = 3) -> str:
    f = r.feature(suffix, "vegetation", parent, detail, gameplay={"flammable": True})
    r.put(x, y, z, "grass_dark", f)
    r.put(x, y, z + 1, "leaves", f)
    if stable_hash(r.seed, suffix) % 2:
        r.put(x + 1, y, z + 1, "leaves_light", f)
    return f


def build_barren(seed: int, lod: int = 0, params=None) -> Recipe:
    r = Recipe("barren", seed, lod, params)
    root = _terrain_block(r, 11, "sand")
    # Side geology is deliberately exposed above the flat layers.
    for i, (z, mat) in enumerate([(-2, "stone_dark"), (-1, "dirt_dark"), (0, "sand")]):
        f = r.feature(f"geology:band:{i:02d}", "geologyBand", root, 2)
        for x in range(-11, 12):
            r.put(x, -11, z, mat, f)
            r.put(-11, x, z, mat, f)
    mounds = [(-6, -4, 2), (5, 5, 3), (4, -7, 2), (-7, 6, 2)]
    for i, (cx, cy, height) in enumerate(mounds):
        f = r.feature(f"landform:mound:{i:02d}", "mound", root, 2)
        for z in range(1, height + 1):
            radius = max(1, height + 2 - z)
            r.disc(cx, cy, z, radius, r.tone("dirt", cx, cy, z, f), f)
    for i, (cx, cy) in enumerate([(1, 2), (-3, 1), (7, -2)]):
        f = r.feature(f"landform:depression:{i:02d}", "depression", root, 2)
        r.disc(cx, cy, 0, 2.2, "dirt_dark", f)
    # Long semantic cracks, not random speckle.
    cracks = [
        [(-9, 1, 1), (-5, 0, 1), (-2, -2, 1), (1, -1, 1)],
        [(3, 8, 1), (4, 5, 1), (7, 2, 1), (8, -1, 1)],
        [(-2, -9, 1), (-1, -6, 1), (2, -4, 1)],
    ]
    for i, points in enumerate(cracks):
        f = r.feature(f"erosion:crack:{i:02d}", "crack", root, 2)
        r.path(points, 0, "dirt_dark", f)
    rock_parent = r.feature("rockField", "rockField", root, 2, gameplay={"erosionSource": True})
    positions = [(-8,-6),(-6,-7),(-5,-4),(8,6),(6,8),(5,6),(2,-8),(4,-6),(-8,3),(-6,4),(8,-4)]
    for i, (x, y) in enumerate(positions):
        _rock(r, f"rock:{i:02d}", x, y, 1, 1 + (i % 3 == 0), rock_parent, 3)
    for i, (x, y) in enumerate([(-4,7),(0,7),(7,1),(-7,-1),(2,5)]):
        _plant(r, f"vegetation:{i:02d}", x, y, 1, root, 3)
    r.meta["design"] = "layered eroded terrain block with readable side geology"
    return r


def _tree(r: Recipe, index: int, x: int, y: int, height: int, archetype: int, parent: str, young=False) -> str:
    detail = 2
    f = r.feature(f"tree:{index:02d}", "youngTree" if young else "tree", parent, detail,
                  gameplay={"flammable": True, "ageClass": "young" if young else "mature"})
    trunk_radius = 0 if young or archetype == 0 else 1
    r.column(x, y, 1, height, "wood" if archetype != 2 else "wood_dark", f, trunk_radius)
    if archetype == 0:
        for dz, rad in [(0, 2), (1, 2), (2, 1)]:
            r.sphere(x, y, height + dz, rad, rad, 1, "leaves" if dz < 2 else "leaves_light", f)
    elif archetype == 1:
        for dz, rad in [(0, 3), (1, 3), (2, 2), (3, 1)]:
            r.disc(x, y, height + dz, rad, "leaves_dark" if dz == 0 else "leaves", f)
    else:
        r.sphere(x, y, height + 1, 3, 2, 2, "leaves", f)
        r.sphere(x + 2, y, height + 1, 2, 2, 1, "leaves_light", f)
    branch = r.feature(f"tree:{index:02d}:branch", "branch", f, 3)
    r.path([(x, y, max(2, height-2)), (x + (1 if index % 2 else -1), y + 2, height)], 0, "wood_lit", branch)
    return f


def build_forest(seed: int, lod: int = 0, params=None) -> Recipe:
    r = Recipe("forest", seed, lod, params)
    root = _terrain_block(r, 11, "grass")
    forest = r.feature("stand", "forestStand", root, 1, gameplay={"ecology": True, "flammable": True})
    path_f = r.feature("path", "trail", root, 2, gameplay={"walkable": True})
    path = [(-11,-2,1),(-8,-2,1),(-5,-1,1),(-2,0,1),(1,0,1),(4,2,1),(8,3,1),(11,4,1)]
    r.path(path, 1, "dirt_lit", path_f)
    clearing = r.feature("clearing", "clearing", forest, 2, gameplay={"walkable": True})
    r.disc(2, -3, 1, 3.4, "grass_lit", clearing)
    positions = [(-8,-7),(-4,-8),(1,-8),(6,-7),(9,-3),(-9,-2),(-6,2),(-3,5),(0,7),(5,6),(8,7),(-8,8),(7,1),(-1,-4),(4,-1)]
    for i, (x, y) in enumerate(positions):
        h = 5 + stable_hash(seed, "tree", i) % 5
        _tree(r, i, x, y, h, stable_hash(seed, "arch", i) % 3, forest)
    for j, (x, y) in enumerate([(-5,-5),(3,6),(9,5),(-9,5),(5,-5),(0,3)]):
        _tree(r, 20 + j, x, y, 3 + j % 2, j % 3, forest, young=True)
    shrub_parent = r.feature("understory", "understory", forest, 2)
    shrubs = [(-7,-5),(-2,-7),(4,-7),(8,-1),(-7,1),(-4,7),(2,6),(6,5),(9,2),(0,-6),(5,3),(-10,7)]
    for i, (x, y) in enumerate(shrubs):
        f = r.feature(f"shrub:{i:02d}", "shrub", shrub_parent, 3, gameplay={"flammable": True})
        r.sphere(x, y, 2, 1, 1, 1, "leaves_dark" if i % 3 == 0 else "leaves", f)
    for i, (x, y) in enumerate([(-10,-8),(10,-7),(-9,7),(8,9),(4,4),(-5,4)]):
        _rock(r, f"rock:{i:02d}", x, y, 1, 1, root, 3)
    stump = r.feature("stump:00", "stump", forest, 3)
    r.column(-2, 3, 1, 2, "wood_dark", stump, 1)
    log = r.feature("fallenLog:00", "fallenLog", forest, 3, gameplay={"habitat": True})
    r.path([(-4,1,2),(-1,1,2),(2,2,2)], 0, "wood", log)
    r.meta["design"] = "mixed-age deterministic woodland with path, clearing and understory"
    return r


def _near_cells(x: int, y: int, cells: set[tuple[int,int,int]], radius: float) -> bool:
    rr = radius * radius
    return any((x-cx)*(x-cx) + (y-cy)*(y-cy) <= rr for cx, cy, _ in cells)


def build_volcano(seed: int, lod: int = 0, params=None) -> Recipe:
    r = Recipe("volcano", seed, lod, params)
    root = _terrain_block(r, 12, "stone")
    massif = r.feature("massif", "volcanicMassif", root, 1, gameplay={"hazard": True})
    crater_x = -1 + stable_hash(seed, "crater-x") % 3
    crater_y = stable_hash(seed, "crater-y") % 2
    # Asymmetric silhouette: radial cone + two deterministic lobes + crater depression.
    for x in range(-11, 12):
        for y in range(-11, 12):
            dx, dy = x - crater_x, y - crater_y
            dist = math.hypot(dx, dy)
            lobe = 1.8 * math.sin((x + seed % 7) * .37) + 1.2 * math.cos((y - seed % 5) * .43)
            height = int(max(1, 12 - dist * .78 + lobe * max(0, 1 - dist / 13)))
            if dist < 3.0:
                height = min(height, 9 + int(dist * .45))
            for z in range(1, height + 1):
                mat = r.tone("stone", x, y, z, "massif")
                if z >= 7 and stable_hash(seed, x//2, y//2, "ash") % 4 == 0:
                    mat = "ash"
                r.put(x, y, z, mat, massif)
    crater = r.feature("crater", "crater", massif, 1, gameplay={"lavaSource": True})
    r.disc(crater_x, crater_y, 10, 4.1, "stone_dark", crater, hole=2.1)
    r.disc(crater_x, crater_y, 11, 3.6, "ash_dark", crater, hole=2.3)
    source = r.feature("lavaSource", "lavaSource", crater, 1,
                       relationships=[{"type": "feeds", "target": "volcano:lavaChannel:00"}],
                       gameplay={"activeLava": True})
    r.disc(crater_x, crater_y, 9, 2.1, "lava_hot", source)
    lava_cells = set(r.features[source].cells)
    channels = [
        [(crater_x+1,crater_y,10),(2,-1,9),(4,-2,7),(6,-3,5),(8,-4,3),(11,-5,1)],
        [(crater_x-1,crater_y+1,10),(-3,2,8),(-5,3,6),(-7,4,4),(-9,5,2)],
        [(crater_x,crater_y-1,10),(0,-3,8),(-1,-5,6),(-2,-7,4)],
    ]
    for i, points in enumerate(channels):
        f = r.feature(f"lavaChannel:{i:02d}", "lavaChannel", crater, 1 if i == 0 else 2,
                      relationships=[{"type": "origin", "target": source}],
                      gameplay={"activeLava": True, "primary": i == 0})
        r.path(points, 1 if i == 0 else 0, "lava", f)
        lava_cells |= r.features[f].cells
        if i < 2:
            cascade = r.feature(f"lavaCascade:{i:02d}", "lavaCascade", f, 2,
                                relationships=[{"type": "continues", "target": f}],
                                gameplay={"activeLava": True})
            px, py, pz = points[2]
            r.path([(px,py,pz+1),(px,py,pz-2),(px+1,py,pz-3)], 0, "lava_hot", cascade)
            lava_cells |= r.features[cascade].cells
    ridges = [
        [(-1,1,10),(-3,1,8),(-5,0,6),(-8,-1,3)],
        [(1,2,9),(3,4,7),(5,6,4),(7,8,2)],
        [(-2,-1,9),(-4,-3,7),(-6,-5,4),(-8,-7,2)],
    ]
    for i, points in enumerate(ridges):
        f = r.feature(f"ridge:{i:02d}", "ridge", massif, 2, gameplay={"erosionBarrier": True})
        r.path(points, 1, "stone_lit", f)
    cliffs = [(7,2,4),(-6,6,4),(4,7,3)]
    for i, (x,y,z) in enumerate(cliffs):
        f = r.feature(f"cliff:{i:02d}", "cliff", massif, 2)
        r.cuboid(x-1,x+1,y-1,y+1,1,z,"stone_dark",f)
    terraces = [(-7,1,3,3),(5,-7,2,3),(-3,8,2,2)]
    for i, (x,y,z,rad) in enumerate(terraces):
        safe = r.feature(f"safeTerrace:{i:02d}", "safeTerrace", massif, 2,
                         gameplay={"habitable": True, "safeFromActiveLava": True})
        r.disc(x,y,z,rad,"dirt_lit",safe)
        if i == 0:
            r.disc(x,y,z+1,rad-1,"grass",safe)
    ash_zone = r.feature("ashZone", "ashZone", root, 2, gameplay={"fertilityAfterWeathering": True})
    for x,y in [(-10,-1),(-9,0),(-10,1),(-8,0),(8,8),(9,8),(8,9)]:
        r.put(x,y,1,"ash",ash_zone)
    valley = r.feature("valley", "valley", massif, 2, gameplay={"drainage": True})
    r.path([(-10,-4,1),(-7,-3,2),(-5,-2,3),(-3,-1,4)],1,"ash_dark",valley)
    rocks = r.feature("rockField", "rockField", massif, 2, gameplay={"talus": True})
    rock_positions = [(-11,2),(-10,4),(-8,6),(-6,8),(2,10),(4,9),(7,7),(9,5),(10,2),(9,-7),(7,-9),(3,-10),(-4,-10),(-7,-8)]
    for i,(x,y) in enumerate(rock_positions):
        _rock(r,f"rock:{i:02d}",x,y,1,1+(i%5==0),rocks,3)
    vegetation = r.feature("vegetationZone", "vegetationZone", root, 2,
                           gameplay={"habitable": True, "excludesActiveLava": True})
    candidates = [(-10,8),(-8,9),(-6,9),(-9,6),(-7,2),(-6,1),(-8,0),(5,10),(7,10),(10,8),(10,6),(6,-10),(4,-9),(-4,10)]
    canonical_lava_xy=[(px,py) for path in channels for px,py,_ in path]
    kept = 0
    for x,y in candidates:
        if any((x-px)*(x-px)+(y-py)*(y-py) <= 2.2*2.2 for px,py in canonical_lava_xy):
            continue
        _plant(r,f"vegetation:{kept:02d}",x,y,2,vegetation,3)
        kept += 1
    plume = r.feature("ashPlume", "vfxEmitter", crater, 3, gameplay={"vfx": "ash", "runtimeOnly": True})
    r.meta.update({"design": "asymmetric inhabited volcanic micro-location", "vfxFeature": plume,
                   "activeLavaFeatureIds": [source] + [f"volcano:lavaChannel:{i:02d}" for i in range(3)]})
    return r


def build_river(seed: int, lod: int = 0, params=None) -> Recipe:
    r = Recipe("river", seed, lod, params)
    root = _root(r)
    channel = r.feature("mainChannel", "mainChannel", root, 1, gameplay={"water": True, "flow": True})
    bank = r.feature("bank", "bank", root, 1, gameplay={"shore": True})
    deep = r.feature("deepZone", "deepWater", channel, 2, gameplay={"depth": "deep"})
    shallow = r.feature("shallowZone", "shallowWater", channel, 2, gameplay={"depth": "shallow"})
    wet = r.feature("wetVegetation", "wetVegetation", bank, 2, gameplay={"riparian": True})
    centers = {}
    for y in range(-12, 13):
        centers[y] = round(math.sin((y + seed % 11) * .29) * 3 + math.sin(y * .11) * 1.5)
    for x in range(-12, 13):
        for y in range(-12, 13):
            c = centers[y]
            width = 3 + (stable_hash(seed, "width", y//3) % 3)
            d = abs(x-c)
            for z, mat, suffix in [(-3,"stone","bedrock"),(-2,"dirt_dark","subsoil"),(-1,"dirt","soil")]:
                f = r.features.get(f"river:{suffix}")
                if not f:
                    r.feature(suffix, "strata", root, 1)
                r.put(x,y,z,mat,f"river:{suffix}")
            if d <= width - 2:
                r.put(x,y,0,"water_deep",deep)
            elif d <= width:
                r.put(x,y,0,"water_shallow",shallow)
            elif d <= width + 1:
                r.put(x,y,0,"sand",bank)
            else:
                surface = r.feature("surface","terrainSurface",root,1,gameplay={"walkable":True})
                r.put(x,y,0,"grass",surface)
    tributary = r.feature("tributary:00", "tributary", channel, 2,
                          relationships=[{"type":"joins","target":channel}], gameplay={"water":True})
    r.path([(-12,8,0),(-9,7,0),(-6,6,0),(-3,5,0),(centers[4],4,0)],1,"water_shallow",tributary)
    rapid = r.feature("rapid:00", "rapid", channel, 2, gameplay={"flowSpeed":"fast"})
    c = centers[-3]
    r.path([(c-2,-4,1),(c,-3,1),(c+2,-2,0)],1,"water_shallow",rapid)
    if stable_hash(seed,"waterfall") % 2 == 0:
        fall = r.feature("waterfall:00","waterfall",channel,2,gameplay={"drop":True})
        c2=centers[7]
        r.path([(c2,6,2),(c2,7,1),(c2,8,0)],1,"water",fall)
    for i,y in enumerate(range(-10,11,4)):
        c=centers[y]
        for side in (-1,1):
            x=c+side*(5+(i%2))
            _plant(r,f"bankPlant:{i:02d}:{'L' if side<0 else 'R'}",x,y,1,wet,3)
    for i,(x,y) in enumerate([(-10,-9),(8,-7),(-7,-1),(9,2),(-9,9),(7,10)]):
        _rock(r,f"bankRock:{i:02d}",x,y,1,1,bank,3)
    r.meta["design"]="variable-width meandering river system with tributary, depth zones and riparian edge"
    return r


BUILDERS = {"barren": build_barren, "forest": build_forest, "volcano": build_volcano, "river": build_river}
