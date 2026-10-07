# Desktop AI — Universal Microdetail V2

## Цель
Довести микродетализацию до production PASS, не создавая вторую систему и не нагружая компьютер без необходимости.

## Перед работой
1. Прочитать `AGENTS.md`, `DESKTOP_AI_INSTALL_AND_VERIFY.md`, `WORK_IN_PROGRESS.md`.
2. Работать только в отдельной AI branch/worktree off-Desktop.
3. Не трогать dirty work других агентов, не force-push, не пушить прямо в `master`.
4. Browser/cloud first: локально выполнять только проверки, которые нельзя разумно вынести в GitHub/CI.

## Что уже установлено этой веткой
- `shared/microdetail-policy.json` — single source of truth.
- `shared/graphics/universal-voxel-microdetail.js` — geometry/shader runtime.
- `shared/graphics/universal-voxel-microdetail-bootstrap.js` — existing THREE hook.
- bootstrap подключён к `voxel-world` и `ai3d-voxel-city`.
- audit подключён к существующему World Quality Autopilot.
- Node regression tests добавлены в общий `node --test`.

## Обязательная проверка
```powershell
npm run quality:world:microdetail
node --test test/world-microdetail.test.js
npm run check:fast
npm run check
```
Не скрывать FAIL и не ослаблять проверки.

## Browser evidence до 100%
Запустить существующий dev/server path и Playwright/browser verification без production deploy:
- `apps/voxel-world/`: stone/earth/brick рядом 1–3 м — видны реальные cubic protrusions + dents;
- те же поверхности дальше — detail переходит в shader/base без pop/regression;
- water/glass остаются гладкими;
- remote avatar head — тонкая face/skin detail, не «каменное лицо»;
- `apps/ai3d-voxel-city/` FRONT EXACT визуально не меняется;
- PLAYABLE/ORBIT получает detail только в пределах budget;
- collision, jump, step-up, block edit и multiplayer sync не регрессируют.

Сохранить FPS, frame time, triangles, draw calls до/после через существующую telemetry/evidence систему. Не создавать отдельную базу отчётов.

## Если FPS просел
1. Проверить `window.UniversalVoxelMicrodetail.stats()`.
2. Сначала уменьшать `maxActiveMeshes` / `maxDetailedFacesPerMesh` / `faceProbability` в едином policy JSON.
3. Не снижать качество всей сцены раньше микродетального tier.
4. Если первый detail-build даёт main-thread spike — доказать profiler trace и только затем вынести builder в Worker.
5. Если bottleneck GPU shader — уменьшить `shaderScale`, а не разрушать geometry/lighting мира.
6. Зафиксировать root cause + regression protection в существующей quality/knowledge системе.

## Если mesh/анимация ломается
- SkinnedMesh topology не менять: только shader path.
- Явно поставить `microdetailSemantic` для неоднозначного asset.
- Transparent/depthWrite-special материалы оставить без microdetail, пока отдельный тест не докажет безопасность.
- FRONT EXACT нельзя менять для AI3D verification.

## Дополнительный бесплатный open-source — только по evidence
- `meshoptimizer/gltfpack`: https://github.com/zeux/meshoptimizer — первый кандидат для imported GLB.
- `three-mesh-bvh`: https://github.com/gkjohnson/three-mesh-bvh — только для доказанного raycast/spatial bottleneck.
- KTX-Software/Basis: https://github.com/KhronosGroup/KTX-Software — когда есть texture-detail atlases.
- FastNoiseLite: https://github.com/Auburn/FastNoiseLite — только если встроенный deterministic hash визуально недостаточен и CPU не регрессирует.

## Completion gate
Не считать 100%, пока нет одновременно:
- `quality:world:microdetail` PASS;
- focused tests PASS;
- общий `npm run check` PASS или документирован только доказанный unrelated master failure;
- desktop + mobile browser visual evidence;
- FPS/triangles evidence;
- exact-front preservation evidence;
- gameplay/collision regression evidence.

После подтверждённой ошибки: root cause → fix → focused regression → dependent gates → сохранить урок в существующую knowledge/Collective Brain систему.
