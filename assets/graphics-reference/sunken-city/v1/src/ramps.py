"""Palette of the sunken city: hue-shifted ramps, dark → light, in the house style of «Остров сумерек»
(shadows drift to blue-violet, lights to warm). Glow ramps are the bioluminescent colours: they ignore
the light and feed the emissive maps (bloom in 3D, glow masks in 2D)."""
from pixel import OUTLINE, Y as GOLD, H as BLOOD, make_ramp

# ── stone, sand and ground ──
STONE = ["#0b0d1c", "#141a30", "#1f2945", "#2d3c5c", "#405675", "#5c7790", "#86a1b0"]     # gothic stone, cold
STONE_D = ["#08091a", "#0f1428", "#18213a", "#232f4c", "#334462", "#4a6079", "#6c8698"]   # weathered, darker
SAND = ["#14192a", "#1f2a3a", "#2d3f4c", "#40595e", "#5a7a72", "#7e9e88", "#aac3a2"]      # seabed sand
SILT = ["#0e1018", "#181b28", "#252a36", "#353b45", "#4a5056", "#646b6a"]
ROCK = ["#08090f", "#11131d", "#1b1f2c", "#282d3c", "#373e4f", "#4b5465", "#66707e"]      # basalt
BONE = ["#2a2620", "#454036", "#655d4e", "#8a806a", "#ada186", "#cdc3a6", "#e8e0c6"]

# ── wood, metal, cloth ──
WOOD = ["#0f0b10", "#1b141a", "#2b1f24", "#3d2b2c", "#523a33", "#6b4d3d", "#87654a"]      # waterlogged planks
WOOD_G = ["#0a0f0e", "#141c1a", "#202b26", "#2e3b31", "#3f4d3b", "#556347", "#707c57"]    # rotten, algae-green
VERD = ["#0b1c1e", "#123232", "#1c4c48", "#2b6b5f", "#3f8d76", "#5fb08e", "#8dd3aa"]      # verdigris copper
COPPER = ["#2a1210", "#4d2216", "#77391c", "#a35424", "#c97434", "#e59a52", "#f7c27e"]
RUST = ["#140c0c", "#2a1612", "#462116", "#66301a", "#8a4420", "#ad5f2b", "#cf8443"]
IRON = ["#0c0e16", "#161a26", "#222838", "#30384c", "#434d63", "#5d687d", "#7e8a9c"]
BRASS = ["#2a1808", "#4e300e", "#7a4e14", "#a8721c", "#cf9a2c", "#ecc254", "#fde69a"]
CLOTH = ["#1c1a22", "#2f2c34", "#45414a", "#5f5a60", "#7c7677", "#9d968f", "#bfb7aa"]
PEARL = ["#3a3550", "#5d5878", "#8783a2", "#b2b0c8", "#d8d8ea", "#f4f4ff"]
GLASS = ["#0c1a2a", "#13304a", "#1e4c6c", "#2f6e8e", "#4e95ae", "#86c3d0", "#c8eef0"]

# ── living things ──
KELP = ["#06140f", "#0c2419", "#143822", "#1f4f2a", "#2f6a31", "#4a8738", "#72a843"]
GRASS = ["#10180c", "#1a2a12", "#2a4318", "#3d5e1f", "#567d27", "#759c31", "#9cbd45"]
FISH = ["#090914", "#121428", "#1c2140", "#273257", "#36476e", "#4e6589", "#7088a6"]     # deep-blue scales
ANGLER = ["#0c0710", "#170e1c", "#24162a", "#33203a", "#46304b", "#5e445f", "#7a5c78"]   # dusky violet-brown
EEL = ["#05100f", "#0b1d1c", "#12302d", "#1b4540", "#265c52", "#367766", "#4f957c"]
MANTA = ["#06081a", "#0d1230", "#151f48", "#203060", "#2f4678", "#486294", "#6d86b2"]
BELLY = ["#2d3550", "#46527a", "#6676a0", "#8c9cc2", "#b8c6e0", "#e2ebf6"]
CRAB = ["#1c0a0c", "#3a1216", "#5e1c1c", "#862a22", "#ad4128", "#d0623a", "#ea8e58"]
SHELL = ["#1f1416", "#3a2626", "#5c3c34", "#836046", "#a8865c", "#cbab7c", "#e8d2a6"]
CORAL_P = make_ramp("#e0607e", 7, 0.86)
CORAL_O = make_ramp("#f08a3c", 7, 0.86)
CORAL_V = make_ramp("#9a5ad8", 7, 0.86)
EYE_W = ["#9fb0c0", "#d5e2ea", "#f4fbff"]
PUPIL = ["#05040a", "#120d1c"]

# ── bioluminescence (dark → white-hot core): the six moss colours ──
TEAL = ["#063238", "#0b5a62", "#11898f", "#2cc7c4", "#7ff5e6", "#d8fff8"]
VIOLET = ["#26103e", "#45197a", "#6d28b8", "#a24ef0", "#d39bff", "#f5e6ff"]
AMBER = ["#3a1a06", "#6e340a", "#a8580f", "#e88a1e", "#ffc25a", "#fff0c2"]
CRIMSON = ["#3a0814", "#6e1024", "#a81c3a", "#e83a5a", "#ff8a9c", "#ffe2e8"]
EMERALD = ["#073314", "#0d5c22", "#159034", "#2fd05a", "#8cffa0", "#e2ffe6"]
AZURE = ["#0a1a48", "#11307e", "#1a4cc0", "#3a7cf0", "#8cbcff", "#e2efff"]
GLOWS = dict(teal=TEAL, violet=VIOLET, amber=AMBER, crimson=CRIMSON, emerald=EMERALD, azure=AZURE)
GLOW_RU = dict(teal="бирюзовый", violet="лиловый", amber="янтарный", crimson="алый", emerald="изумрудный", azure="лазурный")
FILAMENT = ["#4a1c04", "#9a4a08", "#ff9a1a", "#ffd25a", "#fff4c4", "#ffffff"]      # an Edison bulb's wire
SPARK = ["#0b2a40", "#155a8a", "#2a9ae0", "#7ad8ff", "#d2f6ff", "#ffffff"]          # electric arcs

RAMPS = dict(STONE=STONE, STONE_D=STONE_D, SAND=SAND, SILT=SILT, ROCK=ROCK, BONE=BONE, WOOD=WOOD, WOOD_G=WOOD_G, VERD=VERD,
             COPPER=COPPER, RUST=RUST, IRON=IRON, BRASS=BRASS, CLOTH=CLOTH, PEARL=PEARL, GLASS=GLASS, KELP=KELP, GRASS=GRASS,
             FISH=FISH, ANGLER=ANGLER, EEL=EEL, MANTA=MANTA, BELLY=BELLY, CRAB=CRAB, SHELL=SHELL, CORAL_P=CORAL_P, CORAL_O=CORAL_O,
             CORAL_V=CORAL_V, EYE_W=EYE_W, PUPIL=PUPIL, GOLD=GOLD, BLOOD=BLOOD, TEAL=TEAL, VIOLET=VIOLET, AMBER=AMBER,
             CRIMSON=CRIMSON, EMERALD=EMERALD, AZURE=AZURE, FILAMENT=FILAMENT, SPARK=SPARK)

# water around everything (backgrounds, fog in previews)
ABYSS = ["#02030a", "#040816", "#071026", "#0b1a38", "#11284c", "#1a3a62", "#285276"]
__all__ = list(RAMPS) + ["RAMPS", "GLOWS", "GLOW_RU", "ABYSS", "OUTLINE"]
