from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class MaterialProfile:
    name: str
    roughness: float
    metallic: float
    bevel_scale: float
    microdetail_scale: float
    microdetail_strength: float
    color_variation: float
    weathering: float
    wetness: float
    displacement_hint: float
    semantic_priority: float


PROFILES = {
    "stone": MaterialProfile("stone", 0.68, 0.0, 0.0014, 7.0, 0.34, 0.08, 0.55, 0.32, 0.0016, 0.92),
    "brick": MaterialProfile("brick", 0.72, 0.0, 0.0012, 9.0, 0.38, 0.07, 0.62, 0.28, 0.0018, 0.90),
    "concrete": MaterialProfile("concrete", 0.74, 0.0, 0.0010, 11.0, 0.28, 0.055, 0.50, 0.24, 0.0010, 0.82),
    "ground": MaterialProfile("ground", 0.78, 0.0, 0.0015, 6.0, 0.42, 0.10, 0.68, 0.38, 0.0020, 0.88),
    "wood": MaterialProfile("wood", 0.58, 0.0, 0.0009, 10.0, 0.22, 0.06, 0.48, 0.16, 0.0007, 0.86),
    "metal": MaterialProfile("metal", 0.31, 0.96, 0.00055, 16.0, 0.11, 0.035, 0.46, 0.20, 0.0002, 0.95),
    "painted_metal": MaterialProfile("painted_metal", 0.43, 0.15, 0.00065, 15.0, 0.14, 0.045, 0.58, 0.20, 0.00025, 0.93),
    "glass": MaterialProfile("glass", 0.08, 0.0, 0.00015, 28.0, 0.02, 0.01, 0.06, 0.16, 0.0, 0.98),
    "leather": MaterialProfile("leather", 0.52, 0.0, 0.00035, 22.0, 0.16, 0.045, 0.34, 0.12, 0.00025, 0.91),
    "fabric": MaterialProfile("fabric", 0.76, 0.0, 0.00015, 34.0, 0.18, 0.035, 0.22, 0.04, 0.0001, 0.88),
    "skin": MaterialProfile("skin", 0.46, 0.0, 0.00008, 38.0, 0.05, 0.018, 0.02, 0.0, 0.0, 1.00),
    "roof": MaterialProfile("roof", 0.66, 0.0, 0.0010, 8.0, 0.30, 0.065, 0.60, 0.30, 0.0010, 0.89),
    "ceramic": MaterialProfile("ceramic", 0.22, 0.0, 0.00035, 18.0, 0.08, 0.025, 0.16, 0.18, 0.00018, 0.91),
    "plastic": MaterialProfile("plastic", 0.38, 0.0, 0.00025, 22.0, 0.07, 0.028, 0.18, 0.10, 0.00012, 0.86),
    "rubber": MaterialProfile("rubber", 0.82, 0.0, 0.00022, 24.0, 0.10, 0.025, 0.26, 0.08, 0.00015, 0.84),
    "foliage": MaterialProfile("foliage", 0.62, 0.0, 0.00012, 30.0, 0.15, 0.08, 0.36, 0.22, 0.00010, 0.90),
    "water": MaterialProfile("water", 0.045, 0.0, 0.00005, 36.0, 0.03, 0.015, 0.02, 0.95, 0.0, 0.99),
    "generic": MaterialProfile("generic", 0.54, 0.0, 0.00055, 15.0, 0.13, 0.035, 0.24, 0.10, 0.0003, 0.80),
}

_KEYWORDS = {
    "stone": ("stone", "rock", "cobble", "cobblestone", "granite", "marble", "limestone", "кам", "булыж"),
    "brick": ("brick", "masonry", "кирп"),
    "concrete": ("concrete", "cement", "plaster", "stucco", "бетон", "штукатур"),
    "ground": ("ground", "road", "street", "pavement", "floor", "soil", "dirt", "mud", "terrain", "зем", "гряз", "мостов", "дорог"),
    "wood": ("wood", "timber", "oak", "pine", "plank", "дерев", "доск"),
    "painted_metal": ("painted metal", "painted_metal", "enamel", "coated metal"),
    "metal": ("metal", "iron", "steel", "bronze", "copper", "brass", "aluminium", "aluminum", "желез", "сталь", "бронз", "медь"),
    "glass": ("glass", "window", "crystal", "стек", "витраж"),
    "leather": ("leather", "кож"),
    "fabric": ("fabric", "cloth", "textile", "cotton", "wool", "ткан", "матер"),
    "skin": ("skin", "face", "body", "flesh", "кожа", "лицо"),
    "roof": ("roof", "tile", "shingle", "крыша", "череп"),
    "ceramic": ("ceramic", "porcelain", "pottery", "керами", "фарфор"),
    "plastic": ("plastic", "polymer", "пластик", "пластмасс"),
    "rubber": ("rubber", "tire", "tyre", "резин", "шина"),
    "foliage": ("leaf", "leaves", "foliage", "grass", "plant", "moss", "лист", "трава", "растен", "мох"),
    "water": ("water", "liquid", "puddle", "river", "lake", "вода", "луж", "река"),
}


def classify_material_name(name: str | None) -> str:
    value = re.sub(r"[_\-.]+", " ", (name or "").lower()).strip()
    if not value:
        return "generic"
    for key in ("painted_metal", "stone", "brick", "concrete", "ground", "wood", "metal", "glass", "leather", "fabric", "skin", "roof", "ceramic", "plastic", "rubber", "foliage", "water"):
        if any(token in value for token in _KEYWORDS[key]):
            return key
    return "generic"


def classify_object(name: str | None, material_names: list[str] | tuple[str, ...] | None = None) -> str:
    votes: dict[str, int] = {}
    candidates = [name or "", *(material_names or [])]
    for candidate in candidates:
        cls = classify_material_name(candidate)
        votes[cls] = votes.get(cls, 0) + (1 if cls != "generic" else 0)
    non_generic = [(count, cls) for cls, count in votes.items() if cls != "generic"]
    if non_generic:
        return max(non_generic)[1]
    return "generic"


def profile_for(class_name: str) -> dict:
    return asdict(PROFILES.get(class_name, PROFILES["generic"]))


def deterministic_variation(seed_text: str) -> float:
    digest = hashlib.sha256(seed_text.encode("utf-8", errors="ignore")).digest()
    value = int.from_bytes(digest[:4], "little") / 0xFFFFFFFF
    return value * 2.0 - 1.0


def all_profiles() -> dict[str, dict]:
    return {key: asdict(value) for key, value in PROFILES.items()}
