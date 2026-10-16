# Затонувший город — ассет-пак

76 моделей (52 анимированных), 36 тайлов, 11 анимированных тайлов, 38 блоков, 9 эффектов, параллакс из 5 слоёв.

Каждая модель есть во всех видах: 2D (вид сбоку), 2.5D (изометрия, sprite stack), 3D (.glb с анимациями, .vox, .obj).
Масштаб: 16 вокселей = 1 блок = 1 метр. Пиксель-арт: свет сверху-слева, рампы со сдвигом оттенка, обводка #1a1326.
Файлы *_glow.png — маски свечения (для bloom / аддитивного слоя).

## Папки
- `2d/sprites` — спрайт вида сбоку; `2d/anim` — анимации полосой кадров; `2d/fx` — эффекты
- `2.5d/iso` — изометрия (все стороны в ряд); `2.5d/iso_anim` — строки = стороны, столбцы = кадры
- `2.5d/stack` — sprite stack (срезы снизу вверх, сеткой); `2.5d/stack_anim` — строка = кадр
- `2.5d/iso_tiles` — изо-кубы блоков (32×32), `anim/` — анимированные; `2.5d/parallax` — слои фона
- `3d/glb` — glTF с анимациями (Three.js, Godot, Blender, Unity); `3d/vox` — MagicaVoxel; `3d/obj` — OBJ+MTL; `3d/blocks` — блоки
- `tiles` — тайлы 16×16 (+ atlas.png), `tiles/anim` — анимированные, `tiles/autotile` — 16 краёв (N·1+E·2+S·4+W·8)
- `manifest.json` — всё перечислено: размеры кадров, число кадров, fps, стороны

## English
Sunken gothic city pack: every model as 2D side sprite, isometric 2.5D (8/4 directions), sprite stack and 3D
(.glb with baked looping animations, MagicaVoxel .vox, .obj). 16 voxels = 1 block = 1 m. *_glow.png = emissive masks.
Generated procedurally by `src/` (python3 src/build.py).
