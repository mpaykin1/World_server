# WORLD SERVER CHARACTERFORGE CPU V2 — START HERE

## Название технологии

**CharacterForge CPU Voxel Pipeline**  
Класс: **CPU-first Multi-view Game Character Reconstruction & Parametric Voxel Rigging**.

Это обновление расширяет уже существующий `services/ai3d-worker`; вторую параллельную 3D-фабрику не создавать.

## Что появилось в V2

1. `character_voxel` — CPU-only режим игрового 3D-воксельного персонажа.
2. Новый multi-view endpoint: `POST /v1/characterforge/jobs`.
3. Входы: `front` обязательно; `side`, `back`, `left` опционально.
4. Команды детализации:
   - `сделай пиксели крупнее` / `сделай меньше детализацию` -> меньше вокселей по высоте;
   - `сделай пиксели мельче` / `сделай больше детализацию` -> больше вокселей по высоте.
5. Три LOD за один прогон: coarse / primary / fine.
6. **Stable Voxel Identity**: одна каноническая палитра, один rig schema и одни canonical bounds для всех LOD.
7. Side-view silhouette constraint: боковой референс корректирует глубину модели на CPU.
8. Multi-view texture projection: front/back/side/left используются при покраске граней.
9. Humanoid rig `voxel-humanoid-v2`, жёсткие region weights для сохранения воксельной формы.
10. Idle / Walk / Run / Jump + foot-contact markers + измерение loop-contact drift.
11. `characterforge-rig-map.json` + `characterforge-animation-contract.json` для retargeting.
12. Самодостаточный `characterforge-godot.zip` с GLB, `.tscn`, контроллером и manifest.
13. Content-addressed SHA-256 cache: одинаковый вход + параметры не пересчитываются заново.
14. Identity/regression gate: палитра и rig hash обязаны совпадать между LOD.
14. Blender self-test создаёт тестового персонажа сам и проверяет 3 GLB без пользовательского ассета.
16. Backup + rollback.
17. RAM governor: высокая детализация автоматически ограничивается по свободной RAM, вместо OOM.
18. Cache governor: TTL/size очистка не даёт content cache расти бесконечно.
19. GPU truth policy: TRELLIS.2/SkinTokens/InstantMesh не могут быть заявлены как использованные в `character_voxel` CPU режиме.

---

# Что скачать

## ОБЯЗАТЕЛЬНО: Blender

Официально: https://www.blender.org/download/

Установить Blender 4.x или новее. После установки выполнить:

```powershell
blender --version
```

Если команда не находится, определить полный путь, например:

```text
C:\Program Files\Blender Foundation\Blender 4.x\blender.exe
```

и задать:

```powershell
$env:BLENDER_BIN="C:\Program Files\Blender Foundation\Blender 4.x\blender.exe"
```

Важно: Blender Voxel Remesh — ядро нашей управляемой «пикселизации». Чем меньше физический voxel size, тем больше деталей; CharacterForge переводит это в понятный параметр `voxelsPerCharacterHeight`.

## РЕКОМЕНДУЕТСЯ: rembg CPU

Официальный репозиторий: https://github.com/danielgatis/rembg

Текущий официальный CPU-вариант:

```powershell
python -m pip install "rembg[cpu]"
```

Если нужен CLI:

```powershell
python -m pip install "rembg[cpu,cli]"
```

На момент подготовки V2 upstream требует Python `>=3.11,<3.14`. Если текущий worker использует несовместимую версию Python — **не ломать окружение ради rembg**. Оставить background removal как optional enhancement: pipeline продолжит работу с исходной картинкой.

## ОПЦИОНАЛЬНО: AutoRemesher

https://github.com/huxingyi/autoremesher/releases

AutoRemesher бесплатный, MIT, имеет headless CLI. **Не вставлять его перед каждым Voxel Remesh автоматически:** Blender Voxel Remesh всё равно создаёт новую topology. Использовать AutoRemesher только для будущего smooth/non-voxel companion mesh или специального clean-topology экспорта.

## ОПЦИОНАЛЬНО: ComfyUI

https://github.com/comfyanonymous/ComfyUI

ComfyUI не является обязательным runtime CharacterForge. Если он уже установлен, переиспользовать его как UI/preprocessing orchestrator; не создавать второй ComfyUI.

---

# Установка — Desktop AI обязан выполнить полностью

Рабочий репозиторий:

```text
C:\Users\user\Desktop\World_server
```

## 1. Сначала защита

```powershell
cd C:\Users\user\Desktop\World_server
git status
git rev-parse --short HEAD
```

Не делать прямой push в `master`. Создать/использовать отдельную ветку Desktop AI по действующим правилам репозитория.

Перед изменениями сохранить текущий commit и незакоммиченные изменения. Инсталлятор также создаст `.characterforge-backups/v2-*`.

## 2. Проверить пакет до установки

Из распакованной папки патча:

```powershell
python tests\test_patch_static.py
python tests\test_installer_integration.py
```

Обязательно получить:

```text
PATCH_STATIC_V2_PASS
INSTALLER_INTEGRATION_V2_PASS
```

Если FAIL — исправить первопричину в патче, повторить тесты. Не продолжать с частично прошедшим патчем.

## 3. Установить V2

Находясь в корне `World_server`, вызвать инсталлятор полным путём:

```powershell
python <PATH_TO_PATCH>\install_characterforge_cpu_v2.py
```

Ожидается:

```text
CHARACTERFORGE_CPU_V2_INSTALL_PASS
```

Инсталлятор должен:

- переиспользовать `services/ai3d-worker`;
- добавить payload;
- зарегистрировать `character_voxel`;
- добавить `/v1/characterforge/jobs`;
- добавить npm scripts;
- создать backup;
- быть идемпотентным;
- корректно обновлять V1, если V1 уже установлен.

## 4. Установить recommended CPU dependency, не ломая worker

Проверить Python:

```powershell
python --version
```

Если Python совместим с rembg:

```powershell
python -m pip install -r services\ai3d-worker\requirements-characterforge-cpu.txt
```

Если нет — пропустить rembg и зафиксировать это в отчёте как OPTIONAL_MISSING, не как ложный PASS.

## 5. Статическая/интеграционная проверка

```powershell
npm run characterforge:check
```

Далее обязательная проверка Blender:

```powershell
npm run characterforge:check:strict
```

## 6. ОБЯЗАТЕЛЬНЫЙ Blender end-to-end self-test

```powershell
npm run characterforge:selftest
```

Self-test обязан реально запустить Blender headless и создать:

- `character_voxel_16vph.glb`
- `character_voxel.glb` (24 vph)
- `character_voxel_36vph.glb`
- `characterforge-blender-summary.json`
- `characterforge-identity.json`

PASS только если:

- все 3 GLB имеют валидный `glTF` header;
- `paletteHash` один и тот же во всех LOD;
- `rigSchemaHash` один и тот же во всех LOD;
- `stableAcrossLods=true`;
- есть foot-contact markers.

## 7. Общие регрессии World_server

После CharacterForge PASS выполнить существующие проверки сервера:

```powershell
npm run check
npm run golden:check
npm run quality:check
npm run quality:regression
npm run duplicates:check
npm run contracts:check
```

Затем, если текущее окружение позволяет:

```powershell
npm run release:gate
```

CharacterForge не должен ломать Voxel City, AI3D, каталог, Sentry, quality governance и другие существующие системы.

---

# Реальный тест на персонаже

Есть отдельный локальный smoke runner без HTTP token:

```powershell
python services\ai3d-worker\scripts\characterforge_local_smoke.py `
  --front C:\path\front.png `
  --side C:\path\side.png `
  --back C:\path\back.png `
  --resolution 48 `
  --palette-size 24
```

`side` и `back` можно опустить. Но production-quality тест лучше делать с front + side + back.

Проверить в output:

- `character_base_cpu.glb`
- `character_voxel.glb`
- ещё минимум два `character_voxel_*vph.glb`
- `characterforge-identity.json`
- `characterforge-regression.json` со `status=PASS`
- `characterforge-rig-map.json`
- `characterforge-animation-contract.json`
- `characterforge-godot.zip`
- `characterforge-godot-manifest.json`
- `characterforge-detail.json`

После первого успешного прогона запустить **тот же самый запрос второй раз** и убедиться, что manifest показывает `cacheHit=true`.

---

# Как тестировать команды «пиксели крупнее / мельче»

Для одного и того же персонажа выполнить три прогона:

### A — крупные 3D-пиксели

```json
{"detailLevel":55,"detailCommand":"сделай пиксели крупнее","paletteSize":24}
```

### B — базовый

```json
{"detailLevel":55,"paletteSize":24}
```

### C — мелкие 3D-пиксели

```json
{"detailLevel":55,"detailCommand":"сделай пиксели мельче","paletteSize":24}
```

Обязательное условие:

```text
resolution(A) < resolution(B) < resolution(C)
```

Если RAM governor ограничил запрошенное значение, это обязано быть видно в `characterforge-detail.json -> detail.ramGovernor`; скрытое снижение качества запрещено.

При этом `paletteHash` и `rigSchemaHash` должны оставаться стабильными для одного identity preset, если входные изображения одинаковы.

---

# Multi-view API

Рекомендуемый endpoint:

```text
POST /v1/characterforge/jobs
```

Multipart fields:

- `front` — обязательно;
- `side` — рекомендуется;
- `back` — рекомендуется;
- `left` — опционально;
- `params` — JSON строка.

Пример params:

```json
{
  "voxelResolution": 64,
  "paletteSize": 32,
  "sideShapeStrength": 0.85,
  "removeBackground": true,
  "animations": "idle,walk,run,jump"
}
```

Для single-view остаётся совместимым обычный `/v1/jobs` с `mode=character_voxel`.

---

# Правило Desktop AI: не останавливаться на первом FAIL

При любой ошибке Desktop AI должен:

1. сохранить полный log/error;
2. определить **первопричину**, а не маскировать симптом;
3. проверить, не существует ли уже решение/модуль на сервере;
4. исправить минимально и без дубликатов;
5. добавить/усилить regression test;
6. повторить failing test;
7. повторить CharacterForge self-test;
8. повторить затронутые общие проверки World_server;
9. продолжать цикл до PASS либо до доказанного внешнего блокера;
10. если блокер внешний — честно записать точное ограничение и оставить систему в рабочем fallback-режиме.

Нельзя объявлять «100% готово», если реальный Blender self-test или реальный character smoke не запускался.

---

# Rollback

Если обновление нарушило существующий runtime:

```powershell
python <PATH_TO_PATCH>\rollback_characterforge_cpu_v2.py
```

После rollback повторить существующие `npm run check` и quality gates.

---

# Что НЕ делать

- Не устанавливать CUDA/TRELLIS/SkinTokens как обязательную часть CPU pipeline.
- Не покупать GPU/API для прохождения тестов.
- Не создавать второй AI3D worker.
- Не создавать второй asset registry/queue/cache, если существующие серверные системы можно переиспользовать.
- Не выполнять AutoRemesher перед каждым Voxel Remesh без доказанного выигрыша.
- Не считать наличие файла доказательством качества; проверять GLB, identity hash, animation/rig metadata и Godot import.
