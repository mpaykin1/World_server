# Universal Voxel Microdetail V2

## Цель
Единая осмысленная микродетализация для ландшафта, архитектуры, оружия, брони, животных, кожи, лиц/морд, чешуи, меха, ткани и других объектов World_server.

## Архитектура
`shared/microdetail-policy.json` — единственный источник профилей, budget и guards.
`shared/graphics/universal-voxel-microdetail.js` — runtime: cubic-step geometry + shader detail + FPS hysteresis.
`shared/graphics/universal-voxel-microdetail-bootstrap.js` — адаптер существующего THREE renderer без второго renderer/collision world.
`lib/world-quality-microdetail-policy.js` — Node/CI policy API.
`scripts/world-microdetail-audit.js` — структурный quality gate.

## Представления
- NEAR: настоящие ступенчатые кубические выступы и впадины только у ближайших подходящих quad/voxel meshes.
- MID: дешёвая процедурная normal/roughness microdetail у MeshStandard/Physical материалов.
- FAR: исходная mesh без микродетальной геометрии.
- AI3D FRONT EXACT: микрогеометрия и shader strength автоматически выключаются для orthographic exact view.

## Оптимизация
- Исходная geometry никогда не уничтожается и остаётся gameplay/collision source.
- Detail geometry подставляется только на время `renderer.render()` и сразу восстанавливается.
- Активны максимум 1/2/3/5 detail meshes для SAFE/BALANCED/HIGH/ULTRA.
- Новая detail geometry строится максимум для одного требующего обновления mesh за scan cycle.
- Tier от общей WorldQualityAutopilot является потолком; локальный FPS-controller может только временно снизить detail.
- Detached detail geometry автоматически освобождается.
- Transparent water/glass не получают physical microgeometry или shader perturbation.

## Semantic detail
Профили: `smooth`, `stone`, `earth`, `sand`, `snow`, `wood`, `vegetation`, `metal`, `brick`, `skin`, `face`, `scales`, `fur`, `bone`, `armor`, `weapon`, `fabric`, `default`.

Автоматическая классификация использует explicit `object.userData.microdetailSemantic`, затем имя mesh/bone/object, затем свойства/цвет материала. Для неоднозначных production assets генератор/loader должен ставить explicit semantic tag.

API для loader/generator:
```js
window.UniversalVoxelMicrodetail?.tag(mesh, 'weapon', 1.2);
window.UniversalVoxelMicrodetail?.tag(headMesh, 'face', 1.5);
window.UniversalVoxelMicrodetail?.tag(scaleMesh, 'scales', 1.1);
```

## Что ещё внедрять после измерения bottleneck
1. `meshoptimizer/gltfpack` — offline compression/simplification imported GLB персонажей, животных, оружия и брони.
2. KTX2/Basis — compressed normal/ORM/detail atlases, когда появятся texture-based detail maps.
3. `three-mesh-bvh` — только если telemetry докажет bottleneck raycast/spatial queries на imported meshes.
4. Web Worker для `buildDetailedGeometry()` — только если browser profiling покажет main-thread spike при первом приближении к сложным chunks.
5. GPU timer-query telemetry — отделить shader/GPU bottleneck от CPU geometry generation и точнее выбирать tier.
6. Shared deterministic pattern cache — переиспользовать detail geometry для одинаковых asset signatures.
7. Semantic tagging contract в генераторах существ/оружия/брони — повысить точность автоматического профиля до 100%.

## Не делать
- не создавать реальные micro-cubes на всей карте;
- не менять collision под визуальный microrelief;
- не менять topology SkinnedMesh runtime-геометрией;
- не детализировать лицо как камень/чешую;
- не добавлять dependency без измеримого выигрыша;
- не ухудшать готовую графику или golden thresholds ради FPS.
