# SYSTEMS TO ADD NEXT — V6 → подтверждённые 100% и следующий уровень качества

V6 закрывает структурную проблему «появилась новая графическая технология, но quality/optimization слой её не заметил». Следующие шаги — не добавлять красивые проценты, а получить реальные внешние доказательства и усилить production runtime.

## 1. Human-approved Multi-View Golden Baselines

Для каждого сертифицированного мира закрепить минимум 4 реальных эталона:

- desktop-front;
- desktop-playable;
- mobile-portrait;
- mobile-landscape.

Нельзя использовать synthetic fixture или `auto-verified-front-exact` как доказательство эстетического 100%. После утверждения хранить SHA256, viewport, camera state, app/build SHA и допустимый diff.

## 2. Real Rig Playback Farm

Подключить реальные generated/Roblox/Godot/GLB rigs к universal retarget contract. Проверять в runtime: feet direction, attack direction, shield coverage, weapon grip, two-hand constraints, root motion, foot sliding, jitter, bone count и animation LOD. Synthetic rigs оставить только contract tests.

## 3. Physical iPhone + Android Device Gate

Настроить `REAL_DEVICE_PROVIDER_URL` и token. Минимум физический iPhone + Android; лучше low/mid/high Android и старый/новый iPhone. Собирать 2–10 минут: FPS/P95, memory, thermal decay, touch correctness, orientation/resize, loading, long tasks и crashes.

## 4. Local Three.js Vendor Promotion

Текущий master всё ещё содержит CDN import Three.js в voxel runtime. В открытом PR ранее уже существовал проверенный local-vendor путь. Нужно перенести только подтверждённый вариант в актуальную ветку, сохранить лицензию/версию, прогнать desktop/mobile/golden tests и после этого запретить случайный CDN regression.

## 5. Реальный Semantic Texture Baker

V6/V5 уже имеют contract/recipes. Нужен реальный non-destructive offline baker для normal/roughness/AO/emissive/height-detail candidates. При наличии Blender использовать CPU/offline bake. Каждый candidate: source SHA → output SHA → material metrics → screenshot comparison → shader cost → memory budget → accept/reject.

## 6. Довести runtime-unverified technology adapters до real integration

Когда Technology Scout реально обнаружит runtime:

- Goo Engine → toon/outline/light detail + shader variant/pass/distance budget;
- UPBGE → Blender procedural detail + batching/culling/LOD/texture budgets;
- UniRig/Rigify/MPFB → real retarget/playback + deform-bone/animation LOD/pose cache;
- InstantMesh/TRELLIS.2/Hunyuan3D → real runtime evidence + mesh optimizer + LOD + texture budgets + playable delivery gate.

Наличие adapter-файла без запуска не повышает runtime readiness.

## 7. Hunyuan/Godot Full Quality Promotion

Открытый Hunyuan/Godot quality branch должен пройти актуальный V6 Technology Scout, dual-adapter check, quality gates, playable/mobile validation и только затем отдельный PR/rebase/merge. Нельзя переносить старый «100%» self-report без повторной проверки текущим gate.

## 8. Production Canary Provider + Automatic Rollback

Связать canary plan `1 → 5 → 20 → 50 → 100%` с реальным traffic provider. Автоматически останавливать rollout при FPS/P95/crash/control/visual SLO regression и возвращать known-good deployment. Auto-merge master не нужен.

## 9. WebGPU / Meshlets / Hi-Z — только экспериментальная ветка

Добавлять после стабильного WebGL2 fallback:

- WebGPU compute culling;
- meshlets / clustered geometry;
- Hi-Z depth pyramid;
- hardware occlusion;
- indirect draw / GPU-driven rendering.

Каждый путь должен выиграть tournament по quality-per-cost; иначе остаётся выключенным.

## 10. Technology Scout 2.0 — capability fingerprint

Следующий слой должен фиксировать не только название технологии, но и версию, runtime executable, commit/model hash, лицензии, CPU/GPU/RAM requirements, benchmark result и supported capabilities. Изменение версии/commit должно считаться drift и повторно запускать соответствующие quality/optimization tests.

## 11. Cross-World Golden Propagation

Автоматически переносить только доказанно совместимые улучшения: detail rule, material recipe, animation constraint, LOD policy, shader budget, control/physics fix. Перед propagation строить dependency/impact graph и обязательно прогонять destination-world regression tests.

## Формула подтверждённых 100%

**100% production = V6 structural PASS + 100% technology connectivity + human-approved multiview + real rig playback + physical devices + real canary rollback evidence.**

Если какой-либо внешний proof отсутствует, Desktop AI обязан это написать и продолжить исправлять всё, что можно исправить локально, но не подделывать оставшийся процент.
