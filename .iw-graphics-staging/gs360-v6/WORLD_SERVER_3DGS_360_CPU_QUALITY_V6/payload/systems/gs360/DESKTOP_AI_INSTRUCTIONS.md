# DESKTOP AI — GS360 CPU QUALITY V6

## Главная цель
Внедрить V6 в существующий `World_server`, не создавать дубликаты уже работающих систем и не останавливаться на сообщении «нужно подождать». Цикл всегда такой:

**установить → проверить → найти корневую причину ошибки → исправить → добавить регрессионную защиту → повторить проверки → продолжать до PASS всех применимых gates.**

Рабочий корень по умолчанию:
`C:\Users\user\Desktop\World_server`

## 1. Безопасная установка
1. Создать отдельную ветку, например `ai/desktop/gs360-cpu-quality-v6`.
2. НЕ пушить напрямую в `master`.
3. Распаковать архив V6 рядом с репозиторием.
4. Запустить:
```bat
node install-gs360-cpu-quality-v6.cjs C:\Users\user\Desktop\World_server
```
5. Перейти в сервер:
```bat
cd /d C:\Users\user\Desktop\World_server
```
6. Настроить Python-зависимости:
```bat
npm run gs360:setup
```

Инсталлятор идемпотентный. Повторный запуск не должен создавать вторую GS360-систему и не должен ломать уже существующие scripts.

## 2. Обязательные проверки после установки
Выполнить в этом порядке:
```bat
npm run test:gs360
npm run gs360:system-test
npm run gs360:health
npm run gs360:license
npm run gs360:depth
npm run gs360:backend
npm run gs360:resources
npm run gs360:doctor -- --repair
```
`doctor` intentionally runs a fast diagnostic. Full regression is already the separate mandatory `npm run test:gs360`. Use `npm run gs360:doctor -- --repair --full` only when a combined full diagnostic is explicitly needed.

После этого прогнать существующие общие тесты / release gates самого `World_server`. GS360 PASS не заменяет общесерверные проверки.

## 3. Smoke — быстрый режим
```bat
npm run gs360:autopilot -- --input C:\PATH\scene360.png --output C:\PATH\gs360-fast --preference approximate --retries 2
```
Проверить наличие:
- `GS360_MANIFEST.json`
- `GS360_INPUT_QUALITY.json`
- `GS360_SYNTHETIC_CONSISTENCY.json`
- `GS360_ARTIFACT_AUDIT.json`
- `GS360_QUALITY_REPORT.json`
- `GS360_OPTIMIZATION_REPORT.json`
- `GS360_NEXT_ACTION.json`
- `game\seed_gaussians.ply`

Нельзя выдавать preview за настоящий trained 3DGS.

## 4. Smoke — точный режим
При нескольких реальных позициях камеры:
```bat
npm run gs360:autopilot -- --input C:\PATH\p1.png C:\PATH\p2.png C:\PATH\p3.png --output C:\PATH\gs360-accurate --preference accurate --retries 2
```
Для точного результата проверить:
- COLMAP pose estimation реально успешен;
- real trainer реально запущен;
- `quality_contract.trained_3dgs=true` появляется ТОЛЬКО после успешного trainer;
- artifact audit не FAIL;
- synthetic consistency не FAIL;
- quality gate соответствует цели.

## 5. Resume / checkpoint
Продолжение:
```bat
npm run gs360:autopilot -- --input C:\PATH\scene360.png --output C:\PATH\gs360-fast --preference approximate --resume
```
V6 хранит fingerprint входов и generation-настроек. Если картинка или настройки изменились, старый checkpoint обязан быть инвалидирован и generation запускается заново. Не обходить эту защиту.

OpenSplat resume, если backend установлен, сохраняет предыдущий PLY как checkpoint перед продолжением.

## 6. Бесплатные open-source усилители
Сначала выполнить:
```bat
npm run gs360:resources
```
Открыть `GS360_RESOURCE_PLAN.md` и ставить **только отсутствующие** компоненты.

### P0 — желательно установить
**PlayCanvas SplatTransform — MIT**
https://github.com/playcanvas/splat-transform
```bat
npm install -g @playcanvas/splat-transform
splat-transform --version
```
Даёт: фильтр NaN/Inf, decimation, SPZ/SOG, LOD, HTML viewer, статистику и конвертацию. После установки:
```bat
npm run gs360:optimize -- --output C:\PATH\gs360-fast --target spz
```
Исходный PLY не удалять. Активировать compressed вариант только после проверки.

**OpenVINO — Apache-2.0**
https://github.com/openvinotoolkit/openvino
```bat
python -m pip install openvino
python -c "import openvino; print(openvino.__version__)"
```
На CPU V6 кэширует compiled depth model между ракурсами. При наличии совместимой модели использовать `GS360_DEPTH_OPENVINO`.

**COLMAP**
https://github.com/colmap/colmap/releases
Проверка:
```bat
colmap --help
```
Нужен прежде всего для нескольких реальных позиций камеры.

**Depth Anything V2 Small**
https://github.com/DepthAnything/Depth-Anything-V2
Автоматически разрешён только Small-кандидат. Base/Large/Giant не ставить автоматически: у них другая лицензия. Перед любым production/commercial использованием всё равно сохранить сведения о лицензии модели.

### P1 — настоящий trainer
**OpenSplat — AGPL-3.0**
https://github.com/WebODM/OpenSplat
Поддерживает CPU, GPU и resume. На CPU может быть очень медленным, поэтому сначала tiny benchmark. Из-за AGPL требуется license review перед глубокой интеграцией/вендорингом.

### P1 — delivery/inspection
**Niantic SPZ — MIT**
https://github.com/nianticlabs/spz
Не ставить, если SplatTransform уже закрывает конвертацию. Нужен только если требуется нативная SPZ-библиотека.

**SuperSplat — MIT**
https://github.com/playcanvas/supersplat
Использовать как визуальный inspector/editor. Не делать обязательной серверной зависимостью.

## 7. Оптимизация результата
После artifact PASS:
```bat
npm run gs360:optimize -- --output C:\PATH\OUT --target spz
```
Дополнительно:
```bat
npm run gs360:optimize -- --output C:\PATH\OUT --target sog
npm run gs360:optimize -- --output C:\PATH\OUT --target lod
npm run gs360:optimize -- --output C:\PATH\OUT --target html
```
Очистка NaN/Inf только в копию:
```bat
npm run gs360:optimize -- --output C:\PATH\OUT --target spz --clean
```
Никогда не удалять master PLY автоматически. Для переключения runtime entry требуется отдельная осознанная проверка.

## 8. Если надо ждать 10 минут / изменения ещё не вступили в силу
Desktop AI НЕ должен отвечать пользователю «подождите и проверьте сами».
Использовать:
```bat
npm run gs360:wait -- --wait 600 --reason "propagation/install/PATH refresh" --check "node systems/gs360/test.cjs" --retries 3 --retry-wait 60
```
Алгоритм:
1. автоматически ждать;
2. автоматически проверить;
3. при FAIL повторить;
4. если FAIL сохраняется — прочитать ошибку, исправить root cause;
5. снова запустить timer/check;
6. не останавливаться, пока применимая проверка не PASS или не найден внешний блокер, который технически невозможно устранить локально.

## 9. Что обязательно записывать на сервер
После исправления ошибки сохранить:
- симптом;
- root cause;
- исправление;
- regression test;
- команды проверки;
- версию инструмента;
- лицензию внешнего компонента;
- before/after benchmark, если менялась производительность.

Если на сервере уже есть Error/Solution Memory, Asset Registry, Dependency Graph, Control Plane или общая Queue — интегрироваться туда. Вторую параллельную систему не создавать.

## 10. Финальный отчёт Desktop AI
Отчёт должен содержать:
- install: PASS/FAIL;
- `test:gs360`: PASS/FAIL + количество;
- system-test: PASS/FAIL;
- server-wide gates: PASS/FAIL;
- approximate smoke: PASS/FAIL;
- accurate smoke: PASS/FAIL/NOT_APPLICABLE;
- input quality %;
- synthetic consistency %;
- artifact integrity %;
- technical readiness %;
- game preview readiness %;
- reconstruction fidelity %;
- selected depth backend;
- selected trainer backend;
- COLMAP: YES/NO;
- SplatTransform: YES/NO;
- optimized variants + размеры;
- branch + commit;
- реальные blockers.

**Не завышать проценты. Не писать `True trained 3DGS`, если real trainer не завершился успешно.**
