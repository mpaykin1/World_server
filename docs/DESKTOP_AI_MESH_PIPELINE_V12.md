# Desktop AI — World_server Mesh AAA Pipeline V12

## Цель
Установить накопительный **V12 поверх V1–V11**, не ослабляя ни один существующий quality/regression gate, затем работать до фактического устранения всех воспроизводимых исправимых ошибок.

База патча: `8087a2238a3ad59e5676e5cbe568d19991b063df`.
Рабочая ветка: `ai/desktop/mesh-quality-pipeline-v12`.
`master` защищён: прямой push/merge без PR запрещён.

---

# 0. НЕИЗМЕННОЕ ПРАВИЛО: НЕ ОСТАНАВЛИВАТЬСЯ, ПОКА ЕСТЬ ИСПРАВИМЫЕ ОШИБКИ

Desktop AI обязан повторять:

`НАЙТИ → ВОСПРОИЗВЕСТИ → ROOT CAUSE → ИСПРАВИТЬ → REGRESSION TEST → ПОЛНЫЙ IMPACT/QUALITY RUN → ИСКАТЬ ДАЛЬШЕ`

Нельзя завершать работу, если выполняется хотя бы одно условие:
- V11 ledger содержит `OPEN_FIXABLE`;
- V12 report содержит `continueRequired=true`;
- V12 status = `CONTINUE_FIX_LOOP_V12`;
- mandatory unit/repository/release/adversarial/hygiene gate FAIL;
- исправленный fingerprint не имеет durable regression verifier;
- тест нестабилен;
- identical input/policy даёт nondeterministic quality result;
- adversarial GLB corpus проходит незамеченным;
- generated/cache artifacts случайно попали в tracked/release payload;
- после autofix остался тот же fingerprint без расширенного root-cause/impact анализа.

### Разрешённые завершения
1. `CONVERGED_ZERO_KNOWN_ERRORS_V12` — локально нет известных исправимых ошибок, mandatory gates PASS.
2. `EXTERNALLY_BLOCKED_NOT_FULLY_VERIFIED_V12` — только если внешний блокер доказан structured evidence и его невозможно исправить кодом в текущем окружении.

Внешний блокер **не равен PASS**. Не писать «всё готово на 100%», если отсутствуют реальный GPU/device-farm/Roblox Studio/Blender/Godot runtime evidence.

---

# 1. Безопасная установка

Из распакованной V12-папки:

```powershell
python .\APPLY_MESH_PIPELINE.py C:\Users\user\Desktop\World_server
```

Installer обязан:
1. `git checkout master`;
2. `git pull origin master`;
3. сверить HEAD с точным V12 base commit;
4. при несовпадении выполнить **SAFE STOP** до копирования файлов;
5. создать/переключить `ai/desktop/mesh-quality-pipeline-v12`;
6. проверить hygiene самого patch payload;
7. установить cumulative V1–V12;
8. compile всех shipped Python;
9. выполнить весь `services/ai3d-worker/tests/test_*.py` с `ResourceWarning` как error;
10. выполнить V12 adversarial binary GLB corpus;
11. выполнить tracked-artifact hygiene gate;
12. выполнить V12 zero-error loop + текущий repository `release:gate`;
13. promoted confirmed fixes синхронизировать в `data/error-prevention-registry.json`;
14. только после PASS — commit → push → PR.

Если `master` изменился, **не применять патч вручную поверх нового HEAD**. Сначала compare/rebase и снова выполнить весь цикл.

---

# 2. Что V12 обязан сохранить

Нельзя удалять или ослаблять:
- immutable `SOURCE_HQ`;
- Fidelity / AAA / Animation / Temporal gates;
- V7 projection, V8 multiview, V9 mesh-native semantics;
- V10 semantic-model provenance/evidence completeness;
- V11 persistent error ledger и permanent recurrence protection;
- PBR family atlas + rollback;
- reversible UV/detail bake;
- LOD/HLOD/impostor/instancing/occlusion/PVS;
- PVS proof/canary/exact rollback;
- separate collision mesh;
- Godot/Web/Roblox target outputs;
- real runtime/device/profiler evidence contracts;
- protected-master branch/PR flow.

Никакая оптимизация скорости не имеет права ослабить Fidelity/Semantic/Temporal/Animation thresholds.

---

# 3. Новые системы V12

## 3.1 Adversarial 3D Corpus

```powershell
cd C:\Users\user\Desktop\World_server\services\ai3d-worker
python scripts\run_adversarial_corpus_v12.py
```

Обязательные binary/data fault classes:
- `bad_magic`;
- `truncated_glb`;
- `length_mismatch`;
- `missing_bin_chunk`;
- `nan_vertex`;
- `index_oob`;
- `degenerate_mesh`;
- `invalid_material_numeric`;
- `invalid_rig_weights`;
- `animation_nan`.

Каждый должен быть `detected=true` и `detectorFailedClosed=true`.
Если нет — чинить validator/gate и повторять.

## 3.2 Artifact Hygiene Gate

Проверить tracked repository:

```powershell
python scripts\run_artifact_hygiene_v12.py --git-tracked-repo C:\Users\user\Desktop\World_server
```

Release/tracked payload не должен содержать:
- `__pycache__`;
- `.pyc/.pyo`;
- temp/swap/backup files;
- `.DS_Store/Thumbs.db`;
- generated cache directories.

V12 package сам проходит этот gate до распространения.

## 3.3 Blender/Godot Compatibility Matrix

```powershell
python scripts\run_compatibility_matrix_v12.py `
  --blender "C:\path\to\blender.exe" `
  --godot "C:\path\to\Godot.exe" `
  --godot-project C:\Users\user\Desktop\World_server\<godot-project-if-applicable>
```

Правила:
- executable должен реально запускаться;
- version считывается из runtime;
- smoke должен реально завершиться кодом 0;
- отсутствующий runtime = `UNVERIFIED_COMPATIBILITY`, не PASS.

Не объявлять совместимость версий только по строке версии без smoke.

## 3.4 Shader Compilation / Stutter QA

V12 target collectors создаются рядом с job outputs:
- `web_runtime_collector_v12.js`;
- `godot_runtime_collector_v12.gd`;
- `runtime-evidence-contract-v12.json`.

Проверка собранных rows:

```powershell
python scripts\run_shader_stutter_v12.py runtime\quality\runtime-samples.json
```

Gate анализирует:
- p95/p99 frame time;
- stutter ratio;
- shader compile events **после warmup**.

Post-warmup compile spike не маскировать средним FPS.

## 3.5 Thermal / Memory Pressure QA

```powershell
python scripts\run_pressure_v12.py runtime\quality\pressure-samples.json
```

Проверяются:
- длительное падение FPS;
- рост RSS;
- рост VRAM;
- температура, если платформа её реально предоставляет;
- `thermalState`;
- `memoryPressure`.

`UNAVAILABLE` допустим для неподдерживаемого счётчика. Synthetic/estimated replacement запрещён.

## 3.6 Guarded Autofix Actuator

V12 умеет оркестрировать Desktop AI, но **никогда не правит `master`**.

Пример:

```powershell
$env:AI3D_DESKTOP_AUTOFIX_COMMAND = '<command that asks desktop AI to fix AI3D_FIX_ISSUE_JSON>'
$env:AI3D_DESKTOP_ROOT_CAUSE_COMMAND = '<deeper root-cause / impact-scan command>'
python scripts\run_autofix_actuator_v12.py --include-release-gate
```

Правила actuator:
- запускается только на `ai/*` или `opencode/*` branch;
- выбирает самый эскалированный open fingerprint;
- передаёт issue через `AI3D_FIX_ISSUE_JSON`;
- после каждого фикса снова запускает V12 verification;
- `--max-attempts 0` = нет искусственного лимита попыток;
- если один и тот же набор ошибок не уменьшается 3 раза → `ROOT_CAUSE_ESCALATION_REQUIRED`;
- этот статус **не разрешает остановиться**: переключиться на более широкий root-cause/impact analysis.

## 3.7 V12 Zero-Error Loop

```powershell
python scripts\run_zero_error_loop_v12.py --cycles 1 --include-release-gate
```

Внутри обязательны:
- tests с `ResourceWarning` as error;
- V11 zero-error/release checks;
- V12 adversarial corpus;
- V12 tracked artifact hygiene;
- optional compatibility/shader/pressure gates, если переданы evidence files.

Если report пишет `continueRequired=true`, исправлять и повторять. Нельзя считать «следующий запуск сделает другой агент» завершением текущей задачи, если исправление доступно сейчас.

---

# 4. Полный V12 verifier

```powershell
python scripts\verify_mesh_pipeline_v12.py `
  --ledger runtime\quality\error-ledger-v11.json `
  --include-release-gate `
  --require-compatibility `
  --shader-samples runtime\quality\runtime-samples.json `
  --pressure-samples runtime\quality\pressure-samples.json `
  --output runtime\quality\mesh-v12-verification.json
```

Для окружения без внешних runtime datasets можно не передавать соответствующие flags. Тогда локальная convergence может пройти, но `fullProductionEvidence` обязана остаться false.

---

# 5. После КАЖДОГО исправления

Обязательно повторить минимум:

```powershell
cd C:\Users\user\Desktop\World_server\services\ai3d-worker
python -W error::ResourceWarning -m unittest discover -s tests -p "test_*.py"
python scripts\run_adversarial_corpus_v12.py
python scripts\run_zero_error_loop_v12.py --cycles 1 --include-release-gate
```

И repository gates:

```powershell
cd C:\Users\user\Desktop\World_server
npm run check
npm run quality:check
npm run quality:regression
npm run duplicates:check
npm run contracts:check
npm run release:gate
```

Если изменение касается web/runtime/UI, прогнать также существующие Playwright/Lighthouse/Sentry/golden gates.

---

# 6. Полная 3D runtime-проверка

На настоящем GLB проверить:
- source immutability;
- Fidelity HQ→LOD0;
- silhouette/detail/material multi-light;
- animation samples;
- temporal anti-shimmer;
- semantic V7/V8/V9 + V10 model contract;
- atlas rollback;
- collision;
- progressive LOD/HLOD/impostor;
- PVS canary/rollback;
- Web/Godot runtime collectors V12;
- shader-stutter;
- thermal/memory pressure;
- target-specific FPS/GPU evidence;
- Roblox Studio rebinding/SurfaceAppearance/collision when Roblox target enabled.

Любое отсутствие внешнего runtime — `UNVERIFIED`, а не fabricated PASS.

---

# 7. Правило повторной ошибки

Если fingerprint вернулся:
- occurrence 2 → root cause mode;
- occurrence 3 → impact scan;
- occurrence 4+ → architecture review.

После подтверждённого исправления:

```powershell
python scripts\promote_error_ledger_v11.py
npm run quality:sync
npm run quality:regression
```

Confirmed fix должен стать permanent regression rule и применяться к будущим проектам.

---

# 8. Финальный PR

Перед commit:
- `git status --short`;
- убедиться, что `.pyc/__pycache__` не tracked;
- V12 local convergence PASS;
- V12 adversarial PASS;
- V12 hygiene PASS;
- release gate PASS;
- все исправленные ledger entries имеют regression protection.

Commit:

```powershell
git add <V12 files>
git commit -m "feat(ai3d): add V12 adversarial runtime assurance and guarded autofix"
git push -u origin ai/desktop/mesh-quality-pipeline-v12
```

Создать PR в `master`. Не auto-merge до CI review.

**Последнее правило:** не прекращать работу из-за того, что исправлен первый найденный баг. Продолжать поиск и полный прогон до нуля известных исправимых ошибок. Если новый тест обнаруживает новую проблему — это новый обязательный цикл исправления, а не причина выключить тест.
