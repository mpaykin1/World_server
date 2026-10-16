"""Every material of the pack in one place. Call setup() once: it registers the ramps, paints the tiles
(tile materials need them) and defines the materials the models are built of."""
import mats
import ramps as R

_done = {}


def setup():
    if _done:
        return _done["tiles"], _done["anims"]
    for r in R.RAMPS.values():
        mats.ramp_id(r)
    mats.ramp_id(R.ABYSS)
    import tilereg
    import tiles_city, tiles_ground, tiles_ship, tiles_anim  # noqa: F401 — they register their painters
    tiles, anims = tilereg.build()
    d = mats.define
    # lit materials (ramp steps chosen by the light)
    for name, ramp, base in (("stone", R.STONE, 3), ("stone_d", R.STONE_D, 3), ("sand", R.SAND, 3), ("silt", R.SILT, 2),
                             ("rock", R.ROCK, 3), ("bone", R.BONE, 4), ("wood", R.WOOD, 3), ("wood_g", R.WOOD_G, 3),
                             ("verd", R.VERD, 3), ("copper", R.COPPER, 3), ("rust", R.RUST, 3), ("cloth", R.CLOTH, 3),
                             ("kelp", R.KELP, 3), ("kelp_d", R.KELP, 2), ("grass", R.GRASS, 3), ("fish", R.FISH, 4),
                             ("fish_d", R.FISH, 2), ("belly", R.BELLY, 2), ("angler", R.ANGLER, 3), ("angler_d", R.ANGLER, 1),
                             ("eel", R.EEL, 3), ("manta", R.MANTA, 3), ("crab", R.CRAB, 3), ("shell", R.SHELL, 4),
                             ("coral_p", R.CORAL_P, 3), ("coral_o", R.CORAL_O, 3), ("coral_v", R.CORAL_V, 3),
                             ("eye_w", R.EYE_W, 1), ("pupil", R.PUPIL, 0), ("blood", R.BLOOD, 2), ("teeth", R.BONE, 5)):
        d(name, "ramp", ramp, base=base)
    d("iron", "ramp", R.IRON, base=3, metal=0.55, rough=0.5)
    d("iron_d", "ramp", R.IRON, base=1, metal=0.55, rough=0.5)
    d("brass", "ramp", R.BRASS, base=4, metal=0.75, rough=0.38)
    d("gold", "ramp", R.GOLD, base=4, metal=0.85, rough=0.3)
    d("pearl", "ramp", R.PEARL, base=3, rough=0.25)
    d("glass", "ramp", R.GLASS, base=4, alpha=0.45, rough=0.1)
    # bioluminescence: the six moss colours in three strengths, an Edison filament, electric arcs
    for c, r in R.GLOWS.items():
        d(c, "glow", r, base=4)
        d(c + "_dim", "glow", r, base=2, emit=1.6)
        d(c + "_hot", "glow", r, base=5, emit=3.2)
    d("filament", "glow", R.FILAMENT, base=4, emit=3.5)
    d("spark", "glow", R.SPARK, base=4, emit=3.5)
    d("jelly_v", "glow", R.VIOLET, base=2, alpha=0.55, emit=1.8)
    d("jelly_t", "glow", R.TEAL, base=2, alpha=0.55, emit=1.8)
    d("bulb", "glow", R.FILAMENT, base=3, alpha=0.6, emit=2.2)
    # tile materials: the models of the city are built of the very same tiles as the tileset
    t = lambda name, side, top=None, bottom=None: d(name, "tile", top=top or side, side=side, bottom=bottom or side)
    t("t_brick", "brick", "paving")
    t("t_brick_dark", "brick_dark", "brick_dark")
    for c in R.GLOWS:
        t(f"t_mossy_{c}", f"brick_moss_{c}", f"moss_{c}", "brick_dark")
        t(f"t_moss_{c}", f"moss_{c}")
    t("t_paving", "paving")
    t("t_tracery", "tracery", "paving")
    t("t_column", "column", "paving")
    for g in ("rose", "azure", "amber"):
        t(f"t_glass_{g}", f"glass_{g}")
    t("t_sand", "silt", "sand")
    t("t_sand_shells", "silt", "sand_shells")
    t("t_silt", "silt")
    t("t_rock", "rock")
    for c in ("pink", "orange", "violet"):
        t(f"t_coral_{c}", f"coral_{c}")
    t("t_bone", "bone")
    t("t_gold", "gold")
    t("t_planks", "planks")
    t("t_planks_rot", "planks_rot")
    t("t_copper", "hull_copper")
    t("t_rust", "rust")
    t("t_brass", "brass")
    t("t_sail", "sail")
    t("t_dome", "dome")
    t("t_caustics", "sand", "caustics")
    t("t_vent", "rock", "vent")
    _done.update(tiles=tiles, anims=anims)
    return tiles, anims


# blocks of the tileset as 3D cubes / isometric cubes: (id, ru, material)
BLOCKS = [
    ("brick", "Готическая кладка", "t_brick"), ("brick_dark", "Кладка в водорослях", "t_brick_dark"),
    *[(f"mossy_{c}", f"Кладка, {R.GLOW_RU[c]} мох", f"t_mossy_{c}") for c in R.GLOWS],
    *[(f"moss_{c}", f"Сияющий мох, {R.GLOW_RU[c]}", f"t_moss_{c}") for c in R.GLOWS],
    ("paving", "Плиты мостовой", "t_paving"), ("tracery", "Резной фриз", "t_tracery"), ("column", "Колонна", "t_column"),
    ("glass_rose", "Витраж розы", "t_glass_rose"), ("glass_azure", "Витраж лазурный", "t_glass_azure"),
    ("glass_amber", "Витраж янтарный", "t_glass_amber"), ("sand", "Песок дна", "t_sand"),
    ("sand_shells", "Песок с ракушками", "t_sand_shells"), ("silt", "Ил", "t_silt"), ("rock", "Базальт", "t_rock"),
    ("coral_pink", "Коралл розовый", "t_coral_pink"), ("coral_orange", "Коралл оранжевый", "t_coral_orange"),
    ("coral_violet", "Коралл фиолетовый", "t_coral_violet"), ("bone", "Китовая кость", "t_bone"),
    ("gold", "Россыпь дублонов", "t_gold"), ("planks", "Доски корабля", "t_planks"), ("planks_rot", "Гнилые доски", "t_planks_rot"),
    ("hull_copper", "Медная обшивка", "t_copper"), ("rust", "Ржавые листы", "t_rust"), ("brass", "Латунь", "t_brass"),
    ("sail", "Парусина", "t_sail"), ("dome", "Стекло купола", "t_dome"), ("caustics", "Песок в каустике", "t_caustics"),
    ("vent", "Горячий источник", "t_vent"),
]
