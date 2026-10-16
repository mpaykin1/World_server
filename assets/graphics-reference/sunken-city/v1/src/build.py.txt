#!/usr/bin/env python3
"""Build the whole «Затонувший город» pack into out/pack: tiles, models in 2D / 2.5D / 3D with animations,
parallax, effects, manifest.json, README and a zip.  usage: python3 src/build.py [--only id,id] [--no-zip]"""
import json
import os
import sys
import time
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import materials

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out", "pack")


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        only = args[args.index("--only") + 1].split(",")
    t0 = time.time()
    tiles, anims = materials.setup()
    import assets
    import assets.creatures, assets.creatures2, assets.flora, assets.city, assets.city2  # noqa: F401
    import assets.wrecks, assets.wrecks2, assets.vehicles, assets.weapons, assets.pickups  # noqa: F401
    import export, tilepack, parallax, fx, render
    os.makedirs(ROOT, exist_ok=True)
    man = dict(name="Затонувший город", version="1.0", unit="16 вокселей = 1 блок = 1 метр; тайл 16×16; свет сверху-слева",
               cats=assets.CATS, models=[], tiles=[], anim_tiles=[], autotiles=[], blocks=[], anim_blocks=[], fx=[], parallax={})
    if not only:
        man["tiles"], man["anim_tiles"] = tilepack.export_tiles(ROOT, tiles, anims)
        man["autotiles"] = tilepack.export_autotiles(ROOT)
        man["blocks"], man["anim_blocks"] = tilepack.export_blocks(ROOT, anims)
        man["fx"] = fx.build(ROOT)
        print(f"tiles, blocks, fx: {time.time() - t0:.1f}s", flush=True)
    models = assets.build_all(only)
    sprites = {}
    for m in models:
        t1 = time.time()
        e = export.export_model(m, ROOT, stacks=True)
        man["models"].append(e)
        from PIL import Image
        import numpy as np
        img = np.array(Image.open(os.path.join(ROOT, e["2d"]["png"])))
        gp = e["2d"].get("glow")
        g = np.array(Image.open(os.path.join(ROOT, gp))) if gp else np.zeros_like(img)
        sprites[m.id] = (img, g)
        render._REST.clear()
        print(f"  {m.id:24s} {time.time() - t1:5.1f}s  vox={e['voxels']}", flush=True)
    if not only:
        man["parallax"] = parallax.build(ROOT, sprites)
        with open(os.path.join(ROOT, "manifest.json"), "w") as fh:
            json.dump(man, fh, ensure_ascii=False, indent=1)
        write_readme(man)
        if "--no-zip" not in args:
            make_zip()
    print(f"done in {time.time() - t0:.1f}s: {len(man['models'])} models", flush=True)


def write_readme(man):
    n = len(man["models"])
    anim = sum(1 for m in man["models"] if m["clips"])
    lines = [
        "# Затонувший город — ассет-пак",
        "",
        f"{n} моделей ({anim} анимированных), {len(man['tiles'])} тайлов, {len(man['anim_tiles'])} анимированных тайлов, "
        f"{len(man['blocks'])} блоков, {len(man['fx'])} эффектов, параллакс из {len([k for k in man['parallax'] if not k.startswith('anim')])} слоёв.",
        "",
        "Каждая модель есть во всех видах: 2D (вид сбоку), 2.5D (изометрия, sprite stack), 3D (.glb с анимациями, .vox, .obj).",
        "Масштаб: 16 вокселей = 1 блок = 1 метр. Пиксель-арт: свет сверху-слева, рампы со сдвигом оттенка, обводка #1a1326.",
        "Файлы *_glow.png — маски свечения (для bloom / аддитивного слоя).",
        "",
        "## Папки",
        "- `2d/sprites` — спрайт вида сбоку; `2d/anim` — анимации полосой кадров; `2d/fx` — эффекты",
        "- `2.5d/iso` — изометрия (все стороны в ряд); `2.5d/iso_anim` — строки = стороны, столбцы = кадры",
        "- `2.5d/stack` — sprite stack (срезы снизу вверх, сеткой); `2.5d/stack_anim` — строка = кадр",
        "- `2.5d/iso_tiles` — изо-кубы блоков (32×32), `anim/` — анимированные; `2.5d/parallax` — слои фона",
        "- `3d/glb` — glTF с анимациями (Three.js, Godot, Blender, Unity); `3d/vox` — MagicaVoxel; `3d/obj` — OBJ+MTL; `3d/blocks` — блоки",
        "- `tiles` — тайлы 16×16 (+ atlas.png), `tiles/anim` — анимированные, `tiles/autotile` — 16 краёв (N·1+E·2+S·4+W·8)",
        "- `manifest.json` — всё перечислено: размеры кадров, число кадров, fps, стороны",
        "",
        "## English",
        "Sunken gothic city pack: every model as 2D side sprite, isometric 2.5D (8/4 directions), sprite stack and 3D",
        "(.glb with baked looping animations, MagicaVoxel .vox, .obj). 16 voxels = 1 block = 1 m. *_glow.png = emissive masks.",
        "Generated procedurally by `src/` (python3 src/build.py).",
    ]
    with open(os.path.join(ROOT, "README.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


def make_zip():
    src_dir = os.path.dirname(os.path.abspath(__file__))
    zp = os.path.join(os.path.dirname(ROOT), "sunken-city-pack.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _, files in os.walk(ROOT):
            for f in files:
                p = os.path.join(base, f)
                z.write(p, os.path.join("sunken-city-pack", os.path.relpath(p, ROOT)))
        for base, _, files in os.walk(src_dir):
            if "__pycache__" in base:
                continue
            for f in files:
                if f.endswith(".py"):
                    p = os.path.join(base, f)
                    z.write(p, os.path.join("sunken-city-pack", "src", os.path.relpath(p, src_dir)))
    print("zip", zp, os.path.getsize(zp) // 1024, "KB")


if __name__ == "__main__":
    main()
