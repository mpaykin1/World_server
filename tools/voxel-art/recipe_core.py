"""Pure deterministic semantic voxel recipe primitives for World Server."""
from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import math
from typing import Any, Iterable

LOD_MAX_DETAIL = {0: 3, 1: 2, 2: 1}
PALETTE = {
    "dirt_dark": (.25, .14, .08, 1), "dirt": (.37, .22, .13, 1), "dirt_lit": (.49, .31, .17, 1),
    "soil_wet": (.20, .15, .11, 1), "sand": (.69, .49, .28, 1), "sand_lit": (.78, .61, .37, 1),
    "grass_dark": (.16, .36, .13, 1), "grass": (.28, .55, .19, 1), "grass_lit": (.39, .67, .25, 1),
    "stone_dark": (.22, .24, .27, 1), "stone": (.35, .39, .43, 1), "stone_lit": (.49, .52, .54, 1),
    "ash_dark": (.24, .22, .22, 1), "ash": (.39, .37, .36, 1), "ash_lit": (.52, .49, .46, 1),
    "road": (.40, .39, .37, 1), "road_lit": (.52, .50, .46, 1),
    "wood_dark": (.25, .12, .05, 1), "wood": (.38, .19, .075, 1), "wood_lit": (.50, .29, .12, 1),
    "leaves_dark": (.08, .28, .11, 1), "leaves": (.14, .40, .15, 1), "leaves_light": (.27, .60, .20, 1),
    "wall": (.82, .78, .66, 1), "wall_dark": (.64, .61, .54, 1), "wall_light": (.91, .87, .76, 1),
    "brick": (.57, .27, .17, 1), "brick_lit": (.72, .36, .22, 1), "roof": (.64, .23, .14, 1),
    "glass": (.40, .72, .89, 1), "glass_dark": (.18, .42, .58, 1),
    "lava_dark": (.55, .08, .01, 1), "lava": (1.0, .27, .012, 1), "lava_hot": (1.0, .72, .08, 1),
    "metal_dark": (.29, .34, .36, 1), "metal": (.55, .63, .67, 1), "metal_lit": (.70, .76, .78, 1),
    "solar": (.06, .23, .48, 1), "crystal": (.03, .79, 1.0, 1), "crystal_hot": (.42, .96, 1.0, 1),
    "water_deep": (.02, .20, .48, .82), "water": (.035, .39, .77, .78), "water_shallow": (.15, .63, .85, .70),
    "skin_dark": (.49, .30, .20, 1), "skin": (.88, .60, .38, 1), "skin_light": (.96, .72, .50, 1),
    "hair_dark": (.10, .07, .05, 1), "hair": (.28, .16, .08, 1),
    "shirt": (.75, .63, .45, 1), "shirt_alt": (.23, .46, .59, 1), "pants": (.24, .22, .20, 1),
    "boot": (.12, .10, .09, 1), "light": (1.0, .72, .22, 1), "white": (.93, .94, .91, 1),
}

TONE_GROUPS = {
    "stone": ("stone_dark", "stone", "stone_lit"),
    "dirt": ("dirt_dark", "dirt", "dirt_lit"),
    "ash": ("ash_dark", "ash", "ash_lit"),
    "grass": ("grass_dark", "grass", "grass_lit"),
    "wood": ("wood_dark", "wood", "wood_lit"),
    "wall": ("wall_dark", "wall", "wall_light"),
    "metal": ("metal_dark", "metal", "metal_lit"),
}


def stable_hash(*parts: Any) -> int:
    raw = "|".join(str(p) for p in parts).encode("utf-8")
    return int.from_bytes(hashlib.sha256(raw).digest()[:8], "little")


@dataclass
class Feature:
    id: str
    type: str
    parent: str | None
    detail: int
    relationships: list[dict[str, str]] = field(default_factory=list)
    gameplay: dict[str, Any] = field(default_factory=dict)
    cells: set[tuple[int, int, int]] = field(default_factory=set)

    def payload(self) -> dict[str, Any]:
        bounds = None
        position = None
        if self.cells:
            xs, ys, zs = zip(*self.cells)
            lo, hi = [min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]
            bounds = [lo, hi]
            position = [round((lo[i] + hi[i]) / 2, 3) for i in range(3)]
        return {
            "id": self.id, "type": self.type, "parent": self.parent,
            "detail": self.detail, "bounds": bounds, "position": position,
            "relationships": self.relationships, "gameplay": self.gameplay,
            "lodPresence": [lod for lod, max_detail in LOD_MAX_DETAIL.items() if self.detail <= max_detail],
        }


class Recipe:
    def __init__(self, kind: str, seed: int, lod: int = 0, params: dict[str, Any] | None = None):
        if lod not in LOD_MAX_DETAIL:
            raise ValueError("lod must be 0, 1 or 2")
        self.kind, self.seed, self.lod = kind, int(seed), lod
        self.max_detail = LOD_MAX_DETAIL[lod]
        self.params = dict(params or {})
        self.voxels: dict[tuple[int, int, int], tuple[str, str]] = {}
        self.features: dict[str, Feature] = {}
        self.meta: dict[str, Any] = {}

    def feature(self, suffix: str, ftype: str, parent: str | None = None, detail: int = 1,
                relationships: Iterable[dict[str, str]] = (), gameplay: dict[str, Any] | None = None) -> str:
        fid = f"{self.kind}:{suffix}"
        self.features.setdefault(fid, Feature(fid, ftype, parent, detail, list(relationships), dict(gameplay or {})))
        return fid

    def put(self, x: int, y: int, z: int, material: str, feature: str) -> None:
        if material not in PALETTE:
            raise KeyError(f"Unknown material {material}")
        f = self.features[feature]
        if f.detail > self.max_detail:
            return
        key = int(x), int(y), int(z)
        previous = self.voxels.get(key)
        if previous and previous[1] in self.features:
            self.features[previous[1]].cells.discard(key)
        self.voxels[key] = material, feature
        f.cells.add(key)

    def cuboid(self, xa: int, xb: int, ya: int, yb: int, za: int, zb: int, material: str, feature: str) -> None:
        for x in range(xa, xb + 1):
            for y in range(ya, yb + 1):
                for z in range(za, zb + 1):
                    self.put(x, y, z, material, feature)

    def column(self, x: int, y: int, za: int, zb: int, material: str, feature: str, radius: int = 0) -> None:
        for z in range(za, zb + 1):
            for dx in range(-radius, radius + 1):
                for dy in range(-radius, radius + 1):
                    if dx * dx + dy * dy <= radius * radius + 0.1:
                        self.put(x + dx, y + dy, z, material, feature)

    def disc(self, cx: int, cy: int, z: int, radius: float, material: str, feature: str, hole: float = -1) -> None:
        r = int(math.ceil(radius))
        for x in range(cx - r, cx + r + 1):
            for y in range(cy - r, cy + r + 1):
                d = math.hypot(x - cx, y - cy)
                if hole < d <= radius:
                    self.put(x, y, z, material, feature)

    def sphere(self, cx: int, cy: int, cz: int, rx: int, ry: int, rz: int, material: str, feature: str) -> None:
        for x in range(cx - rx, cx + rx + 1):
            for y in range(cy - ry, cy + ry + 1):
                for z in range(cz - rz, cz + rz + 1):
                    q = ((x-cx)/max(1,rx))**2 + ((y-cy)/max(1,ry))**2 + ((z-cz)/max(1,rz))**2
                    if q <= 1.05:
                        self.put(x, y, z, material, feature)

    def path(self, points: list[tuple[int, int, int]], radius: int, material: str, feature: str) -> None:
        if len(points) < 2:
            return
        for a, b in zip(points, points[1:]):
            steps = max(abs(b[i] - a[i]) for i in range(3))
            for n in range(steps + 1):
                t = n / max(1, steps)
                x, y, z = [round(a[i] + (b[i] - a[i]) * t) for i in range(3)]
                for dx in range(-radius, radius + 1):
                    for dy in range(-radius, radius + 1):
                        if dx * dx + dy * dy <= radius * radius + 0.1:
                            self.put(x + dx, y + dy, z, material, feature)

    def tone(self, group: str, x: int, y: int, z: int, region: str = "") -> str:
        values = TONE_GROUPS[group]
        # Structured variation: height and semantic region dominate; hash only breaks ties.
        altitude = 1 if z > 6 else (-1 if z < 2 else 0)
        semantic = (stable_hash(region) % 3) - 1
        tie = (stable_hash(self.seed, x // 2, y // 2, region) % 3) - 1
        idx = max(0, min(2, 1 + (altitude + semantic + tie) // 3))
        return values[idx]

    def chance(self, label: str, index: int, numerator: int, denominator: int) -> bool:
        return stable_hash(self.seed, self.kind, label, index) % denominator < numerator

    def graph(self) -> dict[str, Any]:
        root = f"{self.kind}:root"
        return {
            "schemaVersion": 1, "kind": self.kind, "seed": self.seed, "root": root,
            "features": [self.features[key].payload() for key in sorted(self.features)],
        }

    def stats(self) -> dict[str, int]:
        materials = {m for m, _ in self.voxels.values()}
        included = [f for f in self.features.values() if f.cells]
        return {
            "voxelCount": len(self.voxels), "materialCount": len(materials),
            "featureCount": len(included),
            "macroFeatures": sum(f.detail == 1 and bool(f.cells) for f in self.features.values()),
            "mesoFeatures": sum(f.detail == 2 and bool(f.cells) for f in self.features.values()),
            "microFeatures": sum(f.detail == 3 and bool(f.cells) for f in self.features.values()),
        }
