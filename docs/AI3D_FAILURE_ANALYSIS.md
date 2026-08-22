# AI3D Failure Analysis — Baseline `df70c22` → `a38a96d` (gothic voxel city)

> Дата: 2026-08-22, ветка `opencode/ai3d-full-integration`, commit `df70c22a91ac67c958557b19871231c85f0a9688` (baseline, без улучшения генератора), reference `9b4999cb...` (186804 bytes, `reference.png` — закат, собор справа, мосты, город в тумане).

## Что было прислано (скрин пользователя)

- **LEFT**: референс — детальный город, собор 80px высотой, мосты, улицы, туман.
- **CENTER**: `model.glb` — маленькая чёрно-белая “тряпка” 300×300px внутри viewer, плоская сверху, без цвета, без деталей.
- **RIGHT**: `front_clay.png` — серый шипастый хребет, `SSIM 0.18`, `edge_iou 0.025`, `silhouette 0.91`.

Пользователь: *“это вообще не похоже, нужна walkable сцена WASD+мышь”* — **прав**.

## Фактические метрики baseline (из `verification-report.json` + `comparison.json`)

- **Engine**: `grayscale_heightfield_cpu` (честно, не `depth_anything` — `grayscale_fallback`, `blenderEnhancementUsed: false`)
- **Model**: `381328` bytes, `9200 verts`, `16380 faces`, `zDepth 0.86`, `watertight true` (4 борта исправлены), но **HEIGHTFIELD-DOMINANT** — одна поверхность + дно + 4 стены, **без отдельных зданий**.
- **Classification**: `single_object` (ошибочно для города; должно быть `city`)
- **Geometry Integrity**: `VERIFIED 100` (технически вершины есть)
- **GLB Validity**: `VERIFIED 100` (header, buffers, не plane)
- **Volumetric Artifact Integrity**: `VERIFIED 100` (isPlaceholder false, z>0.01) — **но это лишь “не плоскость”, а не “похоже на город”**
- **Image3D Correspondence**: `UNTESTED` (честно, нет render-back с threshold)
- **Depth Accuracy**: `UNTESTED` (grayscale, нет ground truth)
- **Silhouette/Structural/Texture/Godot/Voxel/Overall**: `UNTESTED`
- **Front clay**: `SSIM 0.180`, `edge_iou 0.025`, `silhouette 0.913`, `color 0.0` — **геометрия не похожа**, силуэт совпал только как прямоугольник.
- **Multi-view**: `RELIEF_DOMINANT` (`cx_var 12.9`, `area_var 0.029`) — параллакс есть, но не `VERIFIED_VOLUMETRIC` (`cx_var >=15`), тонкий рельеф сбоку, не город.

**Итог честно**: `PIPELINE COMPLETION VERIFIED 100%` (7 stages: input_validation, classification, depth, geometry, export, validation, evidence_generation) ≠ `IMAGE→3D VISUAL QUALITY UNTESTED`.

## Корневые причины — почему прислали рельеф вместо города

### 1. Грубый CPU fallback вместо реконструкции
- **Ожидалось** (по `OPEN_CODE_TASK.md`): `IMAGE → Depth Anything Small → depth map → segmentation → BuildingGenerator → procgen → Blender detail → GLB`.
- **Было**: `CPU reconstruction` → `grayscale_fallback` (просто `PIL L` 512×512, не `Depth Anything Small` с checkpoint) → `heightfield 64×64` → `z = norm*0.8+0.06` → **одна волна**.
- **Причина**: `DepthAnythingEngine` требует `depth_anything_v2_vits.pth` (>1M) и `torch` + `cv2`. На baseline `runtime/models/*.pth` отсутствовал, `torch` не установлен в CI, поэтому `depth.run` падал и сразу `except` → PIL luma. Мы честно пометили `depthEngine: grayscale_fallback, verified: false`, но **пользователю всё равно прислали рельеф как “результат”**, не пометив крупно `HEIGHTFIELD-DOMINANT`.

### 2. Искусственный обман flat input (до V2)
- До `df70c22` при `span <0.05` добавляли `sin/cos` волны, чтобы пройти `zDepth>0.01`. Это создавало шипастый хребет (как на RIGHT), но **не реконструкцию**. В V2 убрали (`PROCEDURAL_FALLBACK`), но baseline всё ещё heightfield без башен.

### 3. Отсутствие разделения геометрии на компоненты
- Heightfield — одна сетка `size×size` вершин, две триангуляции на квад. **Нет** отдельных зданий, улиц, собора. `connectedComponents = 1`, `independent towers = 0`.
- Проверка `zero-area triangles`, `boundaryEdges`, `watertight` проходила, но `hasWalkableFloor`, `hasVerticalWalls`, `towerCount` не проверялись. Поэтому `volumetric 100%` не означал `walkable`.

### 4. Неверная классификация
- `_classify_image` для города дал `single_object` (std 50, gray 350 не сработал для закатного города с туманом). Должно быть `city` → `BuildingGeneratorThreeJS` (разные дома, крыши, окна) + `bene-proggen-maps` (улицы). Сейчас эта ветка не сработала, город не сгенерирован.

### 5. Blender enhancement не использован
- `blenderEnhancementUsed: false` — хотя `Blender 5.1` найден (`C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`), `CpuReconstructionEngine` имел `pass` вместо реального `bpy` bevel/subdivision/decimation/UV. Поэтому `Depth+Blender` в названии было ложным (исправлено на `grayscale_heightfield_cpu`).

### 6. Смешение PIPELINE и VISUAL
- Ранее `PIPELINE COMPLETION 100%` подавалось как `IMAGE→3D 100%`. В V2 разделено: `PIPELINE VERIFIED 100%` (7 stages) vs `VISUAL UNTESTED` — честно, но пользователь увидел только `100%` и решил, что модель качественная.

### 7. Отсутствие walkable проверки
- До `AI3D_WALKABLE_REQUIREMENTS.md` не было требования: `boundaryEdges==0` + `hasWalkableFloor` + `multi_view: VERIFIED_VOLUMETRIC`. Поэтому `RELIEF_DOMINANT` проходил как успех.

### 8. Текстура не проецировалась
- `front_textured.png` идентичен `front_clay.png` (оба 0.18/0.025) — `color_similarity 0`. Pipeline не делает `texture projection`/`PBR`, только серая глина. Для города нужны `BaseColor` с референса.

## Что нужно устранить (конкретно)

1. **Depth**: скачать `depth_anything_v2_vits.pth` в `runtime/models` (или `services/ai3d-worker/runtime/models`) и реально запускать `DepthAnythingV2` на CPU (даже медленно) — убрать `grayscale_fallback` для города. Если всё ещё fallback — в `comparison.json` крупно `DEPTH: grayscale_fallback`.

2. **Сегментация + procedural city**: после depth → `rembg`/силуэт → детекция зданий (connected regions) → `BuildingGeneratorThreeJS` с разными `floor/length/width` на основе depth, `procgen-maps` для улиц. Сейчас `city` ветка не вызывалась.

3. **Voxel walkable**: вместо heightfield — `voxelsrv`/`LittleCubes` генерация: `palette analysis → depth layers → buildings/roads/terrain → voxel optimization → Godot`. Результат — `apps/gothic-voxel-city/` с `WASD` (как `apps/voxel-world`), а не `model.glb` для OrbitControls.

4. **Side walls уже исправлены** (4 стороны, `watertight true`), но нужно **разделить** `nonflat_mesh_integrity` (z>0) и `closed_volume_integrity` (watertight + hasWalkableFloor). Сейчас `volumetric 100%` даётся за не-плоскость, но не за walkable.

5. **Фикстура**: `make_test_image()` имела `for x: pass` → однотонное (исправлено на детерминированную сцену с кубом/фоном). Для города нужен аналогичный детерминированный тест.

6. **UI**: `apps/ai3d-reference-test` — это baseline-отладчик, не игра. Нужна отдельная `apps/gothic-voxel-city` с `WASD`.

## Что уже исправлено в V2–V3 (чтобы не повторить)

- `ai3d-evidence-v2` канонический (12 IDs), `unknown/missing` → FAIL.
- Структурированные evidence с `inputSha256`/`artifactSha256`/`verifier`/`passed`, SHA 64 hex, `passed:true` обязателен.
- GLB проверка реального binary (header, buffers, accessor bounds, NaN, degenerate, actual bbox).
- `PLACEHOLDER VERIFIED 0%` — любая попытка 85% → FAIL (гейт ловит).
- `image3d_correspondence` только с `renderSha256 + inputSha256` + `silhouette_iou`/`ssim`.
- `Godot` только с `executable + exitCode 0 + importLogSha256`.
- `depth` только с `groundTruthArtifactSha256`.
- Side walls 4 стороны → `boundaryEdges 0`.
- Фикстура детерминированная, `runtime/ci-evidence/quality-report.json` детерминированный.
- `PIPELINE COMPLETION` только с 7 stages (`input_validation`…`evidence_generation`) с `kind/stage/duration/inputSha/artifactPath/SHA/passed`.

## Следующий шаг

Собрать **настоящий walkable voxel-город** (не heightfield) и опубликовать как `https://<preview>/apps/gothic-voxel-city/` — тогда `FRONT GEOMETRY SIMILARITY` и `MULTI-VIEW` станут `VERIFIED`, а не `RELIEF_DOMINANT`.

---

*Зафиксировано в `opencode/ai3d-full-integration` после честного baseline `df70c22` / `a38a96d`.*
