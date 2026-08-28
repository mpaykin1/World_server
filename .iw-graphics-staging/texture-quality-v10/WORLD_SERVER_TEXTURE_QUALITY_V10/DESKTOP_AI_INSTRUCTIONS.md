# Desktop AI — Texture Quality System V10

Цель: безопасно внедрить Texture Quality V10 поверх текущего `World_server`, проверить все уровни V1–V10 на реальных данных и довести candidate до production без регрессий.

## НЕОБСУЖДАЕМОЕ ПРАВИЛО: НЕ ОСТАНАВЛИВАТЬСЯ НА ОШИБКЕ

Desktop AI **не имеет права завершать задачу со словами «есть ошибки», «осталось проверить», «почти готово»**, если ошибка воспроизводится и её можно исправить в текущем репозитории.

Алгоритм обязателен:

```text
найти ошибку -> локализовать root cause -> исправить минимально безопасно ->
добавить/обновить regression test -> повторить конкретный failed test ->
повторить весь Texture V1–V10 suite -> повторить обязательные runtime gates ->
искать следующую ошибку -> повторять цикл
```

Остановиться разрешено только когда выполняется одно из условий:
1. все обнаруженные исправимые ошибки устранены и все обязательные gates = PASS;
2. остался внешний блокер, который нельзя исправить кодом в repo (например, нет Git permission, secret, реального устройства, доступного worker/CDN). Тогда указать **точный внешний блокер, доказательство, уже выполненные проверки и следующую конкретную команду**. Не называть такой блокер PASS.

Каждый исправленный дефект обязан получить regression test/fixture, если технически возможно. Нельзя скрывать failures удалением теста, ослаблением порога без evidence, `try/except pass`, отключением gate или подстановкой выдуманной телеметрии.

---

## 1. Установка V10

Распаковать ZIP и из его корня выполнить:

```powershell
python APPLY_TEXTURE_PIPELINE.py --repo C:\Users\user\Desktop\World_server
```

Инсталлятор обязан:
- требовать чистый Git working tree;
- создать `.texture-pipeline-backup/v10-YYYYMMDD-HHMMSS`;
- записать `rollback-manifest.json`;
- создать/использовать ветку `opencode/texture-quality-v10`;
- никогда не перезаписывать неизвестный новый `server.py`/`api/ai3d.js` вслепую;
- установить весь V1–V10 стек;
- выполнить Python compile;
- выполнить **180/180 tests**;
- при любом обязательном failure автоматически восстановить весь backup-set.

Продолжать только при:

```text
patchVersion: 10.0.0
pythonCompile: PASS
textureTests: 180/180 PASS
```

Если installer упал: устранить причину по правилу выше и запустить снова. Не переходить к deploy с failed installer.

## 2. Ручной rollback

Использовать только backup path, напечатанный installer:

```powershell
python ROLLBACK_TEXTURE_PIPELINE.py --repo C:\Users\user\Desktop\World_server --backup C:\Users\user\Desktop\World_server\.texture-pipeline-backup\v10-YYYYMMDD-HHMMSS
```

После rollback обязательно:

```powershell
git status
python -m py_compile services\ai3d-worker\server.py services\ai3d-worker\ai3d\texture_optimizer.py
```

И smoke-test предыдущего рабочего candidate/production URL.

## 3. Git flow

Только:

```text
opencode/texture-quality-v10
 -> tests
 -> PR
 -> candidate deploy
 -> real runtime evidence
 -> canary
 -> signed attestation + promotion ledger
 -> master
```

Не push/merge напрямую в `master` до обязательных gates.

Если API integration отвечает `403 Resource not accessible by integration`, использовать локальные авторизованные Git credentials Desktop AI. Это внешний permission blocker, а не причина менять production вручную.

## 4. Worker health

После candidate deploy `/health` должен явно показать:

```json
{"textureOptimizer":{"available":true,"version":"10.0.0"}}
```

Если версия другая/поле отсутствует — candidate deploy FAIL. Найти причину deployment/configuration и исправить.

## 5. Durable paths и secrets

Хранилища должны жить вне ephemeral job directory:

```powershell
setx AI3D_TEXTURE_CACHE_DIR "<durable>\texture-cache"
setx TEXTURE_GOLDEN_LIBRARY_DIR "<durable>\golden-textures"
setx TEXTURE_MATERIAL_LIBRARY_DIR "<durable>\canonical-materials"
setx TEXTURE_STREAMING_POLICY_DIR "<durable>\streaming-policy"
setx TEXTURE_CDN_PUBLISH_ROOT "<durable>\texture-cdn"
setx TEXTURE_CDN_SIGNING_SECRET "<random-secret-32+>"
setx TEXTURE_PROMOTION_LEDGER_SECRET "<different-random-secret-32+>"
setx TEXTURE_ATTESTATION_SECRET "<different-random-secret-32+>"
```

Для V10 managed services при наличии:

```powershell
setx TEXTURE_MANAGED_QUEUE_DSN "<postgres/redis/or managed-http endpoint>"
setx TEXTURE_MANAGED_QUEUE_TOKEN "<secret-if-needed>"
setx TEXTURE_REMOTE_CDN_ROOT "<local durable root OR s3/r2 mode>"
setx TEXTURE_REMOTE_CDN_BUCKET "<bucket>"
setx TEXTURE_REMOTE_CDN_ENDPOINT "<S3-compatible R2/S3 endpoint>"
setx TEXTURE_DEVICE_FARM_ENDPOINT "<trusted device-farm endpoint>"
setx TEXTURE_DEVICE_FARM_TOKEN "<secret>"
```

Secrets запрещено коммитить, печатать в обычные logs или помещать в result ZIP.

## 6. Проверить обязательные V10 файлы

```text
services/ai3d-worker/ai3d/texture_runtime_v10.py
services/ai3d-worker/tests/test_texture_v10.py
services/ai3d-worker/tools/managed_texture_queue_backend.py
services/ai3d-worker/tools/publish_texture_cdn_remote.py
services/ai3d-worker/tools/compare_texture_optical_flow.py
services/ai3d-worker/tools/analyze_shader_hitches_v10.py
services/ai3d-worker/tools/train_route_prefetch_v2.py
services/ai3d-worker/tools/material_provenance_graph.py
services/ai3d-worker/tools/run_texture_device_farm.py
services/ai3d-worker/tools/profile_texture_frame_graph.py
services/ai3d-worker/tools/bisect_texture_regression.py
services/ai3d-worker/tools/optimize_scene_quality.py
services/ai3d-worker/tools/forecast_texture_resource_risk.py
services/ai3d-worker/tools/verify_texture_build_attestation.py
services/ai3d-worker/tools/texture_runtime_adapters/web/shader_hitch_collector_v10.js
services/ai3d-worker/tools/texture_runtime_adapters/godot/ShaderHitchCollectorV10.gd
services/ai3d-worker/tools/texture_runtime_adapters/roblox/ShaderHitchCollectorV10.luau
```

Все V1–V9 файлы должны остаться.

## 7. Полный test loop

Из `services/ai3d-worker`:

```powershell
python -m unittest discover -s tests -p "test_texture_*.py" -v
```

Ожидание: **180/180 PASS**.

При failure:
1. повторить только failed test;
2. найти root cause;
3. исправить;
4. добавить regression test, если дефект новый;
5. снова прогнать failed test;
6. снова весь suite;
7. не переходить дальше до PASS.

## 8. Реальный texture pack

Обязателен job `mode=texture_optimize` с реальными:
- hero/face;
- text/signage;
- background;
- normal/roughness/AO/metallic;
- alpha foliage;
- tileables;
- duplicates + near-duplicates;
- хотя бы одним большим environment material.

Проверить `texture-quality-report.json` и все V1–V10 outputs. Не подставлять synthetic runtime metrics вместо реальных production evidence. Synthetic данные допустимы только для unit/integration test и должны быть явно помечены.

## 9. Обязательные V10 outputs

```text
texture-v10-system-plan.json
texture-managed-external-queue.json
texture-verified-remote-cdn-publisher.json
texture-optical-flow-temporal-gate.json
texture-shader-hitch-telemetry.json
texture-route-prefetch-v2-plan.json
texture-material-provenance-graph-plan.json
texture-device-farm-executor-plan.json
texture-frame-graph-causal-profile.json
texture-regression-bisect-plan.json
texture-global-scene-quality-plan.json
texture-long-horizon-risk-forecast.json
texture-reproducible-build-attestation.json
```

И все V1–V9 manifests.

## 10. Managed external queue

Сначала проверить capability:

```powershell
python services\ai3d-worker\tools\managed_texture_queue_backend.py
```

Требования к production backend:
- idempotency;
- fencing token;
- heartbeat/lease expiration;
- retries + dead-letter;
- stale worker не может commit;
- durable shared storage.

`MANAGED_QUEUE_DSN_NOT_CONFIGURED`, отсутствующий driver или неподтверждённый remote endpoint = BLOCKED. Не заменять это shared SQLite на ненадёжном network filesystem.

## 11. Remote R2/S3/CDN publisher

Проверить upload + hash verification на candidate object:

```powershell
python services\ai3d-worker\tools\publish_texture_cdn_remote.py <candidate-file> --channel candidate
```

Production pointer switch разрешён только после:
- upload success;
- post-upload SHA verification;
- signed manifest;
- runtime/render-back PASS;
- canary PASS.

Immutable SHA object никогда не перезаписывать другим содержимым.

## 12. Optical-flow temporal comparison

Снять одинаковый маршрут до/после минимум 24–120 кадров. Затем:

```powershell
python services\ai3d-worker\tools\compare_texture_optical_flow.py <reference_frames_dir> <candidate_frames_dir>
```

`INSUFFICIENT_FRAMES` = STOP. FAIL по motion-compensated delta/motion mismatch = найти конкретный material/mip/normal/compression source и исправить.

## 13. Shader/frame hitch telemetry

Подключить collectors:
- Web: `shader_hitch_collector_v10.js`;
- Godot: `ShaderHitchCollectorV10.gd`;
- Roblox: `ShaderHitchCollectorV10.luau`.

Roblox frame/asset-prewarm spike **не называть shader compile**, если API не предоставляет доказательство.

Анализ:

```powershell
python services\ai3d-worker\tools\analyze_shader_hitches_v10.py shader-events.json
```

Горячие variants добавить в bounded prewarm, затем повторить runtime test.

## 14. Route prefetch V2

V10 использует persistent first/second-order transition model. Обучать только на privacy-safe route IDs/material-set IDs, без пользовательских персональных данных.

```powershell
python services\ai3d-worker\tools\train_route_prefetch_v2.py <durable>\route-v2.sqlite3 routes.json --current SET --previous PREV --bandwidth 20
```

Prefetch всегда подчиняется network + thermal + VRAM budgets. Нельзя улучшать prediction ценой OOM/thrash/hero eviction.

## 15. Provenance graph

Для canonical material/tile сохранять:
- source SHA;
- derived artifact SHA;
- UV/atlas provenance;
- engine import hash;
- render-back evidence SHA;
- consuming projects/worlds;
- promotion/rollback relation.

Проверка lineage:

```powershell
python services\ai3d-worker\tools\material_provenance_graph.py <durable>\material-provenance.sqlite3 --lineage MATERIAL_ID
```

Не распространять shared material на другой project без verified lineage + compatibility gate.

## 16. Device farm

Сначала создать/проверить V9/V10 device jobs, затем:

```powershell
python services\ai3d-worker\tools\run_texture_device_farm.py jobs.json
```

Для реального submit нужен trusted endpoint. Plan без endpoint не является physical-device PASS.

Обязательные classes: iPhone low/high, Android low/high, desktop integrated/discrete — только реально поддерживаемые вашим продуктом профили.

## 17. Frame-graph causal profiler

Подать покадровые метрики:

```powershell
python services\ai3d-worker\tools\profile_texture_frame_graph.py framegraph.json
```

Профайлер связывает spikes с texture uploads/faults, shader compilation, mesh upload, shadow/light/particle/animation. `causalScore` — **подсказка причины, не математическое доказательство**. Подтвердить targeted A/B rerun перед фиксом production policy.

## 18. Regression bisect

Если candidate стал хуже, сначала сформировать последовательность проверенных candidates/commits/assets с `PASS/FAIL`, затем:

```powershell
python services\ai3d-worker\tools\bisect_texture_regression.py candidates.json
```

После найденного `firstBad` Desktop AI обязан проверить diff, определить root cause, исправить и превратить дефект в regression test. Bisect проводить только на candidate/staging, не переключая production туда-сюда.

## 19. Global Scene Quality Optimizer

Объединить варианты quality levels для:
- textures;
- meshes;
- lighting;
- shadows;
- particles;
- animation.

```powershell
python services\ai3d-worker\tools\optimize_scene_quality.py scene-options.json --budgets-json scene-budgets.json
```

Hard budgets нельзя превышать ради среднего quality score. Hero/face critical floors сохраняются из semantic governor.

## 20. Predict OOM / thrash / thermal до падения

Собрать длительную временную серию и выполнить:

```powershell
python services\ai3d-worker\tools\forecast_texture_resource_risk.py resource-timeseries.json
```

Если forecast на canary horizon достигает VRAM/thermal/thrash limit, остановить rollout **до фактического OOM** и уменьшить background residency/prefetch/detail/anisotropy согласно governor policy.

## 21. Signed reproducible build attestation

Для каждого promoted texture artifact сохранить code SHA, toolchain versions, SOURCE_DATE_EPOCH (если pipeline reproducible), artifact SHA-256 и HMAC signature.

Проверка:

```powershell
python services\ai3d-worker\tools\verify_texture_build_attestation.py texture-reproducible-build-attestation.json
```

Tampered/missing signature = STOP. Attestation не доказывает визуальное качество; она доказывает происхождение артефакта и должна использоваться вместе с runtime gates.

## 22. Все старые gates остаются обязательными

Нельзя отключать:
- color/data-map safe SR;
- normal-safe resize;
- PBR health/ORM;
- coherent atlas + gutters;
- UV candidate-only + render-back;
- KTX2/BC/ASTC verification;
- dedupe/cache/Golden Library;
- camera/semantic priorities;
- thermal/OOM/thrash protection;
- runtime FPS/p95/VRAM/visual gates;
- temporal shimmer;
- cohort drift;
- 30–120 min soak;
- staged canary `1 -> 5 -> 10 -> 25 -> 50 -> 100%`;
- immutable promotion ledger;
- rollback drill.

## 23. Mandatory error-hunt pass before merge

После того как всё выглядит зелёным, Desktop AI обязан выполнить **ещё один отдельный поиск ошибок**, а не сразу merge:

1. `git diff --check`;
2. полный `180/180` suite;
3. search TODO/FIXME/temporary bypass в изменённых V10 файлах;
4. проверить, что ни один mandatory gate не имеет `FAIL`, `UNVERIFIED`, `INSUFFICIENT_*`, `BLOCKED` или `promotionBlocked=true` для реально используемой production capability;
5. проверить secrets/log leakage;
6. проверить rollback manifest;
7. candidate smoke test;
8. runtime/render-back/device evidence;
9. повторить root-cause loop для любой найденной проблемы;
10. только после повторного чистого прохода переходить к canary/merge.

**Правило:** не прекращать поиск после первой исправленной ошибки. Продолжать до полного чистого прохода.

## 24. Критерий merge V10

Merge разрешён только если одновременно:
- installer PASS;
- **180/180 tests PASS**;
- `/health.textureOptimizer.version == 10.0.0`;
- реальный texture/mesh pack PASS;
- static + render-back + optical/temporal gates PASS там, где применимы;
- shader/frame hitch gate PASS;
- managed queue verified, если multi-host processing используется;
- remote CDN post-upload hash verified, если CDN publishing используется;
- target runtimes PASS;
- required device cohorts PASS;
- global scene plan within hard budgets;
- risk forecast PASS на canary horizon;
- soak PASS;
- cohort drift PASS с достаточной выборкой либо rollout остаётся ограниченным;
- signed CDN manifest + promotion ledger + build attestation verify;
- каждый canary stage реально измерен;
- rollback target проверен;
- обязательный final error-hunt pass не нашёл новых ошибок.

После production deploy выполнить smoke test. Любой обязательный regression = немедленный controlled rollback к проверенному target, затем цикл `root cause -> fix -> regression test -> full suite -> candidate -> canary`.
