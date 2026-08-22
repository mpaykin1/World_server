# AI3D Server Requirements — Walkable Scenes Only (v1)

> Обязательно для всех AI3D задач. Нарушение = CI FAIL, PR не принимается.

## 1. Максимальная близость к референсу (1 в 1)

- Вход: одна картинка-референс (например, готический voxel-город на закате, 186804 bytes, SHA256 `9b4999cbab9cb7b2e0cc6532a92e1b8a5d743cac93a89911fccdd15bc508db63`).
- Выход должен быть **максимально близок к референсу**, в идеале 1 в 1 по:
  - силуэту / massing (IoU)
  - структуре (SSIM, edge IoU)
  - цвету / палитре
  - ключевым объектам (собор справа, мост, кварталы)
- **Запрещено** считать heightfield-рельеф успешным Image→3D для города. Рельеф может иметь высокий silhouette IoU (0.91 в baseline) при низком SSIM (0.18) — это **не** доказательство сходства.

### Метрики (только из Independent Verifier, `ai3d-evidence-v2`)
- `image3d_correspondence` — `VERIFIED` только с `inputSha256` + `renderSha256` + `comparisonMethod` (`silhouette_iou`/`ssim`/`edge_similarity`) + `numericResult` + `threshold` + `passed` — verifier сам рендерит и сравнивает, не верит генератору.
- `overall_visual_quality` — `UNTESTED` пока критические visual метрики UNTESTED — никогда не `VERIFIED 90%` из головы.

## 2. Запрет нерелевантных результатов

- **Нельзя присылать результаты как в `df70c22` / `a38a96d` baseline:**
  - `model.glb` 381KB, 9200 verts, `grayscale_heightfield_cpu`, `HEIGHTFIELD-DOMINANT`, `RELIEF_DOMINANT`, `front SSIM 0.18 / edge 0.025` — **вообще не похоже**, `CENTER` — маленькая чёрно-белая тряпка, `RIGHT` — серый шипастый хребет.
  - Такие результаты — **FAIL**, даже если `GLB Validity 100%` и `pipeline_completion 100%`.
- **Требование всегда:** результат — **готовая 3D сцена, по которой можно ходить**:
  - **Если референс — город/улица/ландшафт/комната/dungeon:** сцена должна быть walkable `voxel world` (`apps/voxel-world` стиль: `WASD` ходьба, `Shift` бег, `Space` прыжок, мышь обзор, `ЛКМ/ПКМ` ломать/ставить). Минимум: пол, стены, отдельные здания как коллайдеры, а не одна высота.
  - **Если референс — персонаж:** персонаж должен быть внутри 3D мира, управляемый (`WASD` + мышь), с коллизией, а не отдельный GLB без мира.

### Gate
- `walkable_scene_integrity` — новая каноническая метрика `ai3d-evidence-v2`:
  - `VERIFIED 100` только если: `boundaryEdges == 0` + `watertight` (где нужен closed volume) + `connectedComponents >= 2` (не один heightfield) + `hasWalkableFloor` + `hasVerticalWalls` + `renderBack` показывает параллакс (`multi_view_geometry_status: VERIFIED_VOLUMETRIC`, не `RELIEF_DOMINANT`).
  - `HEIGHTFIELD-DOMINANT` / `RELIEF_DOMINANT` + `walkable: false` → `walkable_scene_integrity: UNTESTED` или `VERIFIED 0%` — CI FAIL если заявлено `VERIFIED 100`.

## 3. Что считается успехом для города

- **Визуально 1 в 1:** front render `SSIM >= 0.40` (для voxel-города, с учётом стилизации) + `silhouette IoU >= 0.60` + `edge IoU >= 0.15` (проверяется render-back, не на слово).
- **Геометрия:** не `BILLBOARD_LIKE` (`cx_var <5`) и не `RELIEF_DOMINANT` (`cx_var <15`) — нужен `VERIFIED_VOLUMETRIC` (`cx_var >=15`, `area_var >=0.15`, отдельные дома).
- **Геймплей:** можно зайти внутрь, пройти по улице, обойти собор.

## 4. Интеграция

- Генератор (`PipelineRunner`) — только `generation-manifest.json` (UNTRUSTED).
- Верификатор (`ai3d_verifier/verifier.py`) — независимо читает artifacts, считает SHA, рендерит, проверяет `walkable` и пишет `verification-report.json` (TRUSTED). UI/CI читают только его.
- `Evidence Gate` (`scripts/check-ai3d-claims.py`) — 0 `quality-report.json` → FAIL, любой `walkable VERIFIED 100` без `hasWalkableFloor` → FAIL.

## 5. Публичность

- Результат публикуется как `https://<preview>/apps/gothic-voxel-city/` (или `apps/voxel-world?world=gothic`) — walkable, открывается с другого устройства.
- `apps/ai3d-reference-test/` остаётся baseline-точкой: `REFERENCE | CURRENT 3D — CLAY/TEXTURED | RENDER | DIFFERENCE` — для честного сравнения, но не считается walkable городом.

---

*Версия 1 — зафиксирована в `opencode/ai3d-full-integration`, любые послабления — только через обсуждение и PR.*
