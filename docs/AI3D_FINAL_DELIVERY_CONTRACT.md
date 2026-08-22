# AI3D FINAL DELIVERY CONTRACT v3 — HARD GATE

Это обязательный acceptance contract для всех AI3D-задач World_server.

## Цель

Не «валидный GLB», не «pipeline 100%», не «похожий render».

Цель: **PUBLIC PLAYABLE SCENE URL**, где результат максимально близок к референсу и им можно пользоваться как 3D-миром.

`Render(playableScene, referenceCamera) ≈ reference.png`

Идеал — 1:1 настолько, насколько это технически возможно.

## Для города/мира обязательно
- public HTTPS `/apps/<scene>/`;
- WASD;
- стрелки;
- mouse-look;
- collisions;
- grounding/floor;
- player spawn;
- отдельные архитектурные массы;
- возможность ходить, а не только крутить модель.

## Для персонажа обязательно
- персонаж внутри 3D-мира;
- управление персонажем;
- mouse-look / управляемая камера;
- collisions;
- public scene URL.

Отдельный GLB/FBX viewer — artifact, не final.

## Навсегда запрещено как FINAL
- `apps/ai3d-reference-test/`;
- OrbitControls-only viewer;
- static render / screenshot / clay-only render;
- GLB без playable scene;
- heightfield city;
- relief-dominant city;
- billboard-like city.

Диагностика должна быть подписана: **DIAGNOSTIC ONLY — НЕ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ**.

## READY / NOT_READY
Корень содержит `ai3d-final-delivery.json`.
До прохождения всех проверок: `NOT_READY_FOR_FINAL_DELIVERY`.
Только после реально готовой сцены: `READY_FOR_FINAL_DELIVERY`.

READY требует app + index + client + `scene-delivery.json`, VERIFIED visual metrics и `VERIFIED_VOLUMETRIC`.

## Минимальные floors перед READY
Это не целевые показатели, а минимальный барьер:
- structural similarity >= 0.40
- edge similarity >= 0.15
- silhouette similarity >= 0.60
- color similarity >= 0.50
- multi-view = VERIFIED_VOLUMETRIC

Цель всё равно — максимально близко к 1:1.

## Hard gates
- `node scripts/check-ai3d-delivery-policy.js`
- после публикации: `node scripts/check-ai3d-public-scene.js https://<host>/apps/<scene>`

CI не может использовать `|| true` или `continue-on-error: true` для delivery gate.

## Runtime contract
Playable scene подключает `/shared/ai3d-playable-runtime.js`, выставляет `window.__AI3D_PLAYABLE_SCENE__` и после создания пола/коллизий/spawn вызывает `reportReady(...)`.

## Главный формат ответа пользователю
Основной результат: **PUBLIC PLAYABLE SCENE URL**.
Diagnostic comparison, verifier report и artifacts — только дополнительные ссылки.
