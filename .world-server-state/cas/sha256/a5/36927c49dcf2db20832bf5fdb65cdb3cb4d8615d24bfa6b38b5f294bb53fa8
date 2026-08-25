# DESKTOP AI — WORLD SERVER DREAM AUTOPILOT V5 CPU

Обязательная инструкция для внедрения и проверки патча `WORLD_SERVER_DREAM_AUTOPILOT_V5_CPU`.

## Главное правило

**НЕ ОСТАНАВЛИВАТЬСЯ, ПОКА НЕ НАЙДЕНЫ И НЕ ИСПРАВЛЕНЫ ВСЕ ИСПРАВИМЫЕ ОШИБКИ.**

Обязательный цикл:

`НАЙТИ → ПЕРВОПРИЧИНА → ИСПРАВИТЬ → REGRESSION TEST → ПОВТОРИТЬ ВСЕ ЗАТРОНУТЫЕ TESTS → PASS`

Если ошибка зависит от отсутствующего физического устройства, внешнего CV/Roblox/provider или закрытого доступа, это не PASS. Ставить `BLOCKED` / `NOT_CONFIGURED` / `NOT_VERIFIED`, точно указывать внешний блокер и продолжать исправлять все остальные ошибки.

Нельзя ухудшать графику, физику, управление, анимацию, материалы, тени, свет, производительность или существующие Golden assets ради прохождения теста.

## 1. Отдельная ветка

```bash
git switch master
git pull
git switch -c opencode/dream-autopilot-v5
```

Прочитать:
- `AGENTS.md`
- `DESKTOP_AI_INSTALL_AND_VERIFY.md`
- `WORK_IN_PROGRESS.md`
- текущие quality reports.

## 2. Baseline до патча

```bash
npm ci
npm run release:gate
npm run quality:world:full
```

Сохранить исходные значения из:
- `WORLD_QUALITY_AUTOPILOT_STATUS.json`
- `QUALITY_MASTER_REPORT.json`
- `WORLD_RUNTIME_QUALITY_REPORT.json`
- `WORLD_DEVICE_PROFILE_MATRIX.json`

## 3. Установка

Из корня `World_server`:

```bash
node WORLD_SERVER_DREAM_AUTOPILOT_V5_CPU/install-v5.cjs
npm ci
npx playwright install chromium
```

Запустить установщик второй раз и убедиться, что команды и секции не дублируются.

## 4. Жёсткая локальная проверка

```bash
npm run runtime:proof
npm run quality:dream-agent
npm run quality:physics-guardian
npm run quality:performance:capture
npm run quality:performance-budget -- --require
npm run quality:texture-baker:smoke
npm run quality:meshlets
npm run quality:device:probe
npm run quality:world:v5
npm run quality:system:v5
npm run release:gate
```

Любой FAIL означает: работа не закончена.

## 5. Repair loop

Только в task branch:

```bash
npm run quality:v5:repair
```

Если автоматический safe-fix не устранил причину, исправить её вручную, добавить regression test и снова запустить весь список из раздела 4.

## 6. Физические iOS + Android

Задать:
- `REAL_DEVICE_PROVIDER_URL`
- `REAL_DEVICE_PROVIDER_TOKEN`

```bash
npm run quality:device:probe -- --require
npm run quality:world:devices
npm run quality:world:runtime
```

100% physical-device evidence допускается только когда runtime probe реально видит физический iOS и физический Android. Эмулятор не считать физическим доказательством.

## 7. Roblox

На Windows задать:
- `ROBLOX_STUDIO_PATH`
- `ROBLOX_PLACE_PATH`

```bash
npm run quality:roblox-bridge -- --launch
```

Roblox harness/plugin обязан создать `ROBLOX_TEST_RESULT.json`, затем:

```bash
npm run quality:roblox-bridge -- --require
```

Без фактического результата Studio оставлять `NOT_VERIFIED`.

## 8. Computer Vision Player

`CV_AGENT_ENDPOINT` должен принимать именно изображение/скриншот игры. Скрытые координаты игрового мира не считаются CV-доказательством.

```bash
npm run quality:cv-player -- --require
```

## 9. Multiplayer swarm

Без `SWARM_ADAPTER_MODULE` разрешён только transport-load test и статус PARTIAL.

Для настоящего PASS подключить adapter реального shared game-state / Supabase Realtime протокола:

```bash
npm run quality:swarm -- --require-true-multiplayer
```

Проверять state convergence, desync, duplicate entities, lost events и latency.

## 10. CPU Semantic Texture Baker

```bash
npm run quality:texture-baker:smoke
```

Для реального ассета использовать `services/semantic-texture-baker/bake.py`. Baker создаёт candidate PBR maps: albedo, normal, roughness, AO, height.

**Никогда автоматически не заменять существующий Golden texture.** Сначала visual/perceptual/golden gates и сравнение качества.

## 11. WebGPU meshlets

```bash
npm run quality:meshlets
```

Это эксперимент. WebGL остаётся обязательным fallback. Не включать WebGPU по умолчанию, пока реальный device/browser candidate не победит performance + regression tournament.

## 12. Winner-only PR bot

`.github/workflows/winner-only-pr.yml`:
- только `workflow_dispatch`;
- принимает только `VERIFIED_WINNER` из patch tournament;
- применяет diff в новой ветке;
- повторно запускает release gate и Runtime Proof;
- открывает PR;
- **никогда не auto-merge**;
- **никогда не пушит candidate прямо в master**.

## 13. Canary / rollback

При наличии `CANARY_METRICS.json`:

```bash
npm run quality:canary-rollback -- --enforce
```

`ROLLBACK` нельзя игнорировать.

## 14. Завершение запрещено, пока

Desktop AI не имеет права писать «готово», пока:
- `release:gate` не PASS;
- `RUNTIME_PROOF_REPORT.json.status` не PASS;
- все локально доступные V5 tests не PASS;
- все найденные исправимые regressions не исправлены;
- каждая исправленная ошибка не получила regression protection;
- `SYSTEM_READINESS_V5_REPORT.json` не пересоздан;
- ни одна accepted quality metric не снизилась;
- внешние непроверенные системы не перечислены как blockers.

## 15. Финальный отчёт

Обязательно указать:
1. branch / commit / PR;
2. изменённые файлы;
3. что сохранено без изменений;
4. все тесты PASS/FAIL;
5. `implementationPercent`;
6. `verifiedPercent`;
7. `connectivityPercent`;
8. World runtime %;
9. physical-device evidence %;
10. найденные ошибки и первопричины;
11. исправления + regression tests;
12. внешние blockers;
13. точный следующий шаг.
