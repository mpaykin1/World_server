from __future__ import annotations

import re
from dataclasses import dataclass, asdict


CRITICAL_TOKENS = (
    "face", "head", "eye", "eyelid", "mouth", "lip", "nose", "ear",
    "hand", "finger", "thumb", "weapon", "sword", "blade", "gun", "pistol",
    "rifle", "shield", "trigger", "sight", "ornament", "filigree", "engraving",
    "inscription", "logo", "sign", "statue", "sculpt", "faceplate",
    "лицо", "голов", "глаз", "рот", "нос", "ухо", "рук", "палец", "меч",
    "оруж", "пистолет", "автомат", "щит", "орнамент", "гравир", "стату",
)
HIGH_TOKENS = (
    "character", "body", "torso", "arm", "leg", "foot", "boot", "cloth",
    "armor", "helmet", "door", "window", "arch", "column", "capital", "trim",
    "frame", "railing", "chain", "cable", "pipe", "gear", "clock", "gargoyle",
    "персонаж", "тело", "нога", "стоп", "брон", "шлем", "двер", "окн", "арка",
    "колон", "рама", "перил", "цеп", "труб", "шестер", "горгул",
)
BONE_CRITICAL = (
    "head", "neck", "eye", "jaw", "face", "hand", "finger", "thumb", "wrist",
    "weapon", "sword", "gun", "shield", "голов", "шея", "глаз", "челюст", "кист",
    "палец", "оруж", "меч", "щит",
)


def _normalize(value: str) -> str:
    return re.sub(r"[^a-zа-я0-9]+", " ", (value or "").lower()).strip()


@dataclass(frozen=True)
class SemanticDecision:
    level: str
    min_ratio: float
    score: int
    reasons: tuple[str, ...]

    def to_dict(self) -> dict:
        result = asdict(self)
        result["reasons"] = list(self.reasons)
        return result


def semantic_decision(
    object_name: str,
    material_names: list[str] | tuple[str, ...] = (),
    vertex_group_names: list[str] | tuple[str, ...] = (),
    surface_class: str = "generic",
    has_armature: bool = False,
    has_shape_keys: bool = False,
) -> SemanticDecision:
    text = _normalize(" ".join([object_name, *material_names]))
    groups = _normalize(" ".join(vertex_group_names))
    reasons: list[str] = []
    score = 0

    critical_hits = [token for token in CRITICAL_TOKENS if token in text]
    high_hits = [token for token in HIGH_TOKENS if token in text]
    bone_hits = [token for token in BONE_CRITICAL if token in groups]

    if critical_hits:
        score += 100
        reasons.append("critical-name:" + ",".join(critical_hits[:4]))
    if bone_hits:
        score += 95
        reasons.append("critical-bone:" + ",".join(bone_hits[:4]))
    if high_hits:
        score += 55
        reasons.append("high-name:" + ",".join(high_hits[:4]))
    if surface_class in {"skin", "glass", "metal", "painted_metal"}:
        score += 30
        reasons.append("precision-material:" + surface_class)
    if has_armature:
        score += 35
        reasons.append("armature")
    if has_shape_keys:
        score += 100
        reasons.append("shape-keys")

    if score >= 100:
        return SemanticDecision("critical", 0.96, score, tuple(reasons))
    if score >= 55:
        return SemanticDecision("high", 0.86, score, tuple(reasons))
    if has_armature:
        return SemanticDecision("rigged", 0.72, score, tuple(reasons))
    return SemanticDecision("normal", 0.0, score, tuple(reasons))
