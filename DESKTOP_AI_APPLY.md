# Desktop AI — внедрение Quality Autopilot v11 CPU-FIRST

## 1. Принципы
- Текущий `World_server` — source of truth. Не заменять более новые `release:gate`, quality-runtime, procedural-quality, durable-cycle, visual/perceptual gates, Sentry, Supabase runtime или workflows старыми копиями из патча.
- Работать только в отдельной candidate branch/worktree. Прямой push в `master` запрещён.
- На сервере GPU нет. Не пытаться покупать/требовать GPU и не считать его отсутствие дефектом системы.
- GPU клиентского устройства для WebGL — отдельная вещь; v10 client GPU timer можно сохранять. Речь о **серверном вычислительном GPU**.
- Не выдавать fallback за эквивалент: CPU-фотограмметрия/mesh/point-cloud может заменить часть задач, но это не настоящий 3DGS training.

## 2. Что добавляет v11
1. CPU-first execution policy: CPU выбирается раньше GPU; GPU optional.
2. Adaptive scheduler: `availableParallelism`, load, free RAM, reserve core, backpressure.
3. Реальный `worker_threads` pool для параллельных CPU-задач.
4. Content-addressed SHA-256 cache с atomic write + TTL/LRU cap.
5. Checkpoint/resume длинных CPU jobs с input hash.
6. Memory pressure/leak gate.
7. CPU benchmark и machine profile.
8. WASM SIMD detection; scalar fallback обязателен.
9. Incremental impact planner: лёгкие изменения не гоняют всё без необходимости, gameplay/release изменения всегда поднимают full suite.
10. CPU scene budget: near-field не трогается; под нагрузкой режется только дальний AI/physics/background/streaming batch.
11. CPU toolchain verifier для FFmpeg/Blender/Godot/Node/Python.
12. Supabase CPU runtime profiles + CPU cache event evidence.

## 3. Установка
Запустить из распакованной папки:
```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_QUALITY_AUTOPILOT.ps1 -RepoPath "C:\Users\user\Desktop\World_server"
```
Проверить `data/quality-autopilot/v10-merge-report.json` и `v11-merge-report.json`. Если текущий репозиторий уже содержит более новую реализацию с тем же назначением — сохранить текущую и адаптировать v11 к ней, а не откатывать код.

## 4. Тестовый цикл — правило НЕ ОСТАНАВЛИВАТЬСЯ
Повторять цикл:
`detect -> reproduce -> root cause -> minimal safe fix -> regression test -> targeted test -> full protected gates`.

Не завершать задачу, пока остаётся хоть одна воспроизводимая ошибка, вызванная патчем или находящаяся в затронутой области и исправимая локально. После каждого исправления повторить тест, который падал, затем весь набор обязательных gates. Не маскировать ошибки `try/catch`, skip, fake provider, фиктивными PASS или ослаблением threshold.

Остановка разрешена только на реальном внешнем блокере. В отчёте написать: `HOLD`, точную причину, требуемый внешний ресурс и что уже проверено локально.

## 5. Обязательные команды
```powershell
npm run quality:v11:test
npm run quality:v11:cpu:benchmark
npm run quality:v11:cpu:parallel-scan
npm run quality:v11:cpu:policy
npm run quality:v11:cpu:toolchain
npm run quality:v10:sbom
npm run quality:v10:migrations
npm run quality:v10:backup-drill
npm run release:gate
npm run quality:v11:readiness
```
`quality:v11:cpu:toolchain` без `--strict` может показать HOLD для отсутствующих внешних CPU-бинарников; это не повод фальсифицировать наличие инструмента.

## 6. CPU performance rules
- Reserve минимум 1 logical core для OS/UI/coordination.
- `QUALITY_CPU_MAX_WORKERS` по умолчанию максимум 8, но scheduler обязан уменьшать concurrency по RAM/load.
- Не делать `Promise.all()` на тысячи CPU-heavy задач; использовать scheduler/worker pool.
- Кэшировать deterministic expensive results по content hash.
- Длинные задачи должны уметь resume с checkpoint; input hash изменился — старый checkpoint недействителен.
- При memory/event-loop pressure сначала останавливать background optimization, затем снижать far AI/physics rates; protected gameplay/near-field остаются приоритетом.
- Daily server GPU budget = 0. Global CPU budget продолжает защищаться Supabase RPC `reserve_quality_compute`.

## 7. 3D/AI без GPU
Разрешённые CPU-first направления: video frame extraction, quality/visual metrics, mesh validation/optimization, Blender CPU headless operations, Godot headless tests, photogrammetry/point-cloud pipelines при наличии проверенных CPU tools.

Для `3dgs-train`: без реального GPU не ставить PASS как полноценный 3DGS. Выдать `HOLD` для 3DGS training или создать **явно подписанный альтернативный** photogrammetry mesh / point cloud результат.

## 8. Supabase
Перед миграциями выполнить migration history. Не дублировать уже применённые migrations. v11 CPU migration создаёт только:
- `public.quality_cpu_runtime_profiles_v11`
- `public.quality_cpu_cache_events_v11`
Обе таблицы: RLS ON, anon/authenticated access revoked, service_role-only policy.

## 9. Production safety
- Никакого production promote без текущего `release:gate`, regression, Golden, visual, gameplay и telemetry gates.
- Не снижать near-field graphics ради FPS/CPU.
- Если Vercel connector не видит проект — `HOLD`; не придумывать deployment evidence.
- Если GitHub connector не может создать branch/PR — использовать только локальную candidate branch с обычной Git auth; не обходить через прямой `master`.

## 10. Итоговый отчёт Desktop AI
Обязательно вывести: candidate branch/worktree, merge reports, число PASS/FAIL тестов, CPU cores/effective concurrency/benchmark/WASM SIMD, parallel scan result, cache/checkpoint status, release gate, security/SBOM/migration gates, Supabase migration/privileges, текущий master/evidence score, readiness %, список HOLD и точные следующие действия.
