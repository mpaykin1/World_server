# Pixel2World Multi-View

## Цель

Превращать два или больше пиксельных 2D-эскиза одного объекта в один редактируемый 3D voxel volume, который сразу совместим с существующим World Server runtime.

Базовый пользовательский контракт:

`FRONT.png + RIGHT.png -> normalized projections -> visual hull -> voxel model -> World Server scene -> editor/runtime`

Пользователь не обязан вручную моделировать кубы. Он даёт минимум два согласованных ракурса.

## Что добавлено

- `shared/pixel3d/multiview-voxel.mjs` — clean-room multi-view reconstruction.
- `apps/pixel3d-multiview/` — минимальный WebGL editor: FRONT + RIGHT, orbit, add, erase, paint.
- `test/pixel3d-multiview.test.mjs` — contract tests.
- `scripts/pixel3d-source-audit.cjs` — воспроизводимый 100% file inventory и IMPORT/ADAPT/LEARN/PRESERVE/SKIP audit.
- `data/pixel3d-source-audit.json` — решение для каждого файла исходных проектов.
- `docs/PIXEL3D_SOURCE_AUDIT.md` — сводка аудита.

## Алгоритм двух ортографических ракурсов

Для каждой потенциальной voxel-координаты `(x,y,z)` координата проецируется в каждый предоставленный вид.

Voxel сохраняется только если соответствующий пиксель непрозрачен во **всех** предоставленных силуэтах. Это даёт visual hull — максимальный объём, согласованный с известными силуэтами.

FRONT ограничивает X/Y. RIGHT ограничивает Z/Y. TOP, если он появится третьим входом, дополнительно ограничивает X/Z и резко уменьшает неоднозначность невидимой геометрии.

Цвет voxel'а объединяется из видимых source pixels, а face-color metadata сохраняет сторону происхождения цвета. Модель затем переводится в уже существующий World Server формат `[x,y,z,paletteIndex]`.

## Почему это дополняет текущий single-image pipeline

Существующие `cpu_reconstruction.py` и `voxel_city.py` решают один референс, но глубина там неизбежно inferred/heuristic. В новом режиме второй ракурс становится жёстким геометрическим ограничением.

Новый модуль **не заменяет** existing greedy mesher, chunk streaming, voxel runtime, microdetail stack, material/light stack или single-image AI3D engines. Он добавляет только отсутствующую multi-view reconstruction capability.

## Точность и ограничения

Два **ортографических** вида не определяют внутреннюю геометрию единственным образом. Visual hull честно выбирает максимальный объём, который не противоречит обоим изображениям.

Две произвольные перспективные картинки нельзя считать точными FRONT/RIGHT без калибровки камеры. Для них следующий слой должен оценивать camera pose/FOV, silhouette correspondences, voxel carving/inverse rendering, reprojection error и confidence для невидимых областей.

Нельзя молча выдавать такую реконструкцию за exact geometry.

## Background handling

Editor поддерживает:
- ALPHA — фон уже прозрачный;
- AUTO — удаляется только связанный с краями фон, близкий к цвету углов.

AUTO не является semantic segmentation. Для сложного фона нужен отдельный segmentation adapter.

## Редактор

MVP editor не копирует Blockbench UI или GPL-код. Он использует собственный World Server data model и Three.js, уже применяемый в проекте.

Инструменты: ORBIT, ERASE, ADD, PAINT. Изменения идут через `editVoxelModel`; исходные projection images остаются неизменными.

## Source-policy

### ADAPT
Алгоритмические идеи из MIT-проектов, которые закрывают реальный пробел:
- OrthoVoxel: multi-view silhouette intersection, projection orientation/schema.
- 2d-to-3d-voxelizer: distance-based thickness, palette quantization, voxel edit/face-cull ideas.

### LEARN-REIMPLEMENT
- Blockbench image extrusion, cube/mesh/editor/undo/UV architecture — только как поведенческий референс из-за GPL-3.0.
- Editor/raycast patterns там, где World Server уже имеет собственный renderer/runtime.
- SpriteToVoxel как минимальный regression oracle.

### SKIP
- чужие UI/build frameworks;
- generated bindings/locks;
- demo assets;
- duplicate Three.js renderers/exporters;
- код, не добавляющий уникальную capability.

## Следующие capability-слои

1. Camera-calibrated two-perspective reconstruction.
2. Third-view TOP/LEFT assisted reconstruction.
3. EDT/capsule prior для областей, не ограниченных вторым видом.
4. Symmetry prior с явным opt-in.
5. Part segmentation: head/body/limbs/architecture modules.
6. Mesh surface extraction + GLB export через существующие World Server tools.
7. Rig/animation adapter для персонажей после геометрии.
8. World assembler: несколько реконструированных объектов + semantic placement -> полноценная 3D-локация.
9. Reprojection QA gate: не выпускать модель, если silhouette IoU/confidence ниже порога.

## Evidence

Unit contracts проверяют:
- exact visual-hull intersection на согласованной паре FRONT/RIGHT;
- обнаружение противоречащих силуэтов;
- совместимость с World Server palette-index voxel tuples;
- non-destructive add/paint editing.

## Canonical orchestration layer

Pixel2World is now the deterministic orthographic pixel-art geometry lane inside **REFERENCE3D_AGENT**. General perspective/multi-view inputs are routed through calibration + the existing AI3D/Blender pipeline, followed by cleanup, retopology, UV/PBR, optional animation, GLB export, isolated re-import and render-back verification.

Start from `REFERENCE_3D_AGENT.md` and `docs/REFERENCE_3D_AGENT.md` instead of creating a parallel image-to-3D pipeline.

Technical verification does not imply the user's SUCCESS/FAILURE verdict.
