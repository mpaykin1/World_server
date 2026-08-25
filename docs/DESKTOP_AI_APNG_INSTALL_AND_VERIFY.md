# Desktop AI — APNG Quality System v3 install, repair and verification protocol

## Цель
Внедрить APNG Quality System v3 в актуальный `World_server`, не удаляя, не упрощая и не ухудшая существующую графику, приложения, API, тесты и quality-системы. Работать только через отдельную ветку + PR. Никогда не пушить напрямую в `master`.

## Главное правило
**НЕ ОСТАНАВЛИВАТЬСЯ, пока не найдены и не исправлены все воспроизводимые блокирующие ошибки, появившиеся из-за этого патча или обнаруженные этим патчем в затронутом APNG-контуре.**

Если тест упал: сначала определить корневую причину, затем исправить причину, а не маскировать тест. После каждого исправления повторить затронутый тест, затем весь APNG suite, затем repository gate, затем `npm run check`. Не удалять тест, не ослаблять assertion и не добавлять исключение только ради зелёного CI.

## Источник истины
- Локальный репозиторий: `C:\Users\user\Desktop\World_server`
- Remote: `mpaykin1/World_server`
- Ветка-основа: всегда самый свежий `origin/master` на момент установки.
- При сборке V3 был виден master `fa3445713f8f9f84130c2795421b9cb1ca2d6640`, но bundle **не имеет права** считать этот SHA актуальным: всегда сначала `git pull --ff-only origin master`.

## Один основной запуск
Запустить `INSTALL_APNG_SYSTEM.bat` из этого bundle. Установщик обязан:
1. отказаться работать поверх грязного worktree;
2. сохранить существующую незавершённую работу в её ветке или stash, не удаляя её;
3. `git checkout master` + `git pull --ff-only origin master`;
4. создать `ai/desktop/apng-quality-v3-<timestamp>`;
5. скопировать только APNG-owned файлы;
6. идемпотентно пропатчить текущие `server.js` и `package.json`, не заменяя их целиком;
7. выполнить syntax checks;
8. выполнить `npm run apng:test` — **26/26 или больше PASS**;
9. выполнить `npm run apng:fix` на task branch;
10. повторить `npm run apng:check` и получить 0 active error-level defects;
11. выполнить полный `npm run check`;
12. выполнить `git diff --check` и убедиться, что существующие файлы не удалены;
13. обновить central `QUALITY_MASTER_REPORT.json` через `npm run quality:master-report` и убедиться, что присутствует `apngQuality`;
14. commit + push task branch + PR;
15. дождаться APNG CI, включая Chromium + Firefox + WebKit playback gate;
16. проверить Vercel Preview API/UI, если Preview создан.

## Что V3 обязан уметь
- строгая проверка PNG/APNG CRC, chunk order и APNG sequence numbers;
- 8-bit и 16-bit decode для byte-aligned grayscale/truecolor/GA/RGBA;
- Adam7 decode и нормализация в проверенный non-interlaced RGBA8 APNG;
- точная APNG blend/dispose композиция;
- brightness/color/alpha flash detection;
- anchor drift и coarse motion-vector reversal diagnostics;
- alpha-edge/hidden-RGB halo diagnostics;
- safe cleanup RGB только под `alpha=0`;
- duplicate/timing jitter/loop seam диагностика;
- confidence-gated temporal repair;
- full-frame RGBA8 + SOURCE/NONE normalization;
- exact post-repair pixel-target verification;
- exact frame-count/play-count/duration verification;
- resource limits для upload/frame/decode/output;
- atomic asset replacement + rollback;
- policy-aware intentional visual effects;
- API `/api/apng` + APNG Lab;
- PR gate + scheduled autofix PR;
- cross-browser native playback verification.

## Policy для намеренных эффектов
Файл `apng-quality.config.json` может содержать правила `match` и `intentionalIssues`. Использовать это только когда визуальный эффект действительно намеренный и подтверждён просмотром/референсом.

Нельзя подавлять структурные ошибки. Нельзя использовать policy, чтобы скрыть CRC/sequence/bounds/timeline/pixel verification failure. Любое принятое визуальное исключение должно остаться в `acceptedIntentionalIssues` отчёта.

## Обязательные локальные проверки
В корне `World_server`:
- `npm run apng:test` → 26/26 или больше PASS;
- `npm run apng:check` → exit 0;
- `npm run check` → exit 0;
- `npm run quality:master-report` → exit 0 и `QUALITY_MASTER_REPORT.json.apngQuality` существует;
- `git diff --check` → exit 0;
- `git diff master...HEAD --name-status` → никаких неожиданных `D`;
- `git status --short` → после commit нет install residue.

Если `@playwright/test` и browser binaries доступны локально — выполнить `npm run apng:browser`. Если нет, это **не считается browser PASS**: обязательным доказательством становится зелёный `browser-differential` job в GitHub Actions.

## API verification
На локальном сервере или Vercel Preview:
- `GET /api/apng?action=health` → 200, engine `3.x`, capabilities включают `16`, `adam7:true`, `crossBrowserGate:true`;
- analyze → корректные frame count/duration/source bit depth/interlace/qualityScore;
- repair `temporal=0` → 200 + `X-APNG-Verified: 1` + `X-APNG-Quality-Score`;
- повторный analyze repaired binary → 0 active error-level issues;
- повторный codec-only repair нормализованного файла → deterministic/idempotent, если hidden transparent RGB уже sanitized;
- для 16-bit/Adam7 входа output должен быть verified RGBA8 non-interlaced без изменения отображаемой анимации после 8-bit normalization target.

## Browser verification
GitHub Actions job `browser-differential` обязан выполнить APNG playback в:
- Chromium;
- Firefox;
- WebKit.

PASS: изображение декодируется, размеры верны и наблюдается смена минимум двух кадров. Нельзя считать browser compatibility доказанной только Node-декодером.

На Vercel Preview открыть `/apps/apng-lab/` на desktop и mobile width. Проверить загрузку реального APNG, analyze, repair, independent verify, preview и download.

## Repository asset gate
`npm run apng:fix` выполняется только на task branch. После него обязательно снова `npm run apng:check`.

В `APNG_QUALITY_REPORT.json` записать и проверить:
- scanned/png/apng/repaired/normalized;
- errors/warnings и remainingErrors/remainingWarnings;
- acceptedIntentionalIssues;
- average quality score;
- source bit depth + Adam7 status;
- actions и SHA-256 для изменённых файлов.

## Release blockers
Не merge, пока существует хотя бы одно из следующего:
- `APNG_REPAIR_VERIFY_PIXEL_MISMATCH`;
- `APNG_REPAIR_VERIFY_TIMELINE_MISMATCH`;
- `APNG_REPAIR_REMAINING_ERRORS:*`;
- CRC/sequence/chunk/bounds failure;
- active error-level APNG defect после repair;
- падение любого APNG regression test;
- падение `npm run check`;
- browser-differential не зелёный;
- удалён/упрощён существующий файл или функция;
- APNG Lab/API не работает на Preview;
- Vercel runtime выдаёт новые ошибки, связанные с патчем.

## Алгоритм при любой ошибке
1. Зафиксировать точную команду, файл и сообщение.
2. Воспроизвести минимально.
3. Определить корневую причину.
4. Исправить код/конфигурацию/данные с минимальным blast radius.
5. Добавить или усилить regression test, если ошибка могла вернуться.
6. Перезапустить минимальный тест.
7. Перезапустить `npm run apng:test`.
8. Перезапустить `npm run apng:check`.
9. Перезапустить `npm run check`.
10. Повторять цикл, пока блокирующих ошибок нет.

**Запрещено:** удалять failing test, ослаблять quality gate ради PASS, отключать repair verification, вручную подменять отчёт, удалять проблемный asset вместо исправления, обходить PR/CI. Installer при failure должен откатить task branch к исходному base; после rollback Desktop AI обязан исправить первопричину и повторить цикл.

## Финальный отчёт Desktop AI
Вернуть только подтверждённые результаты:
- master SHA, использованный как base;
- branch + commit SHA + PR URL;
- Vercel Preview URL, если реально создан;
- APNG tests passed/total;
- browser engines passed/total;
- `npm run check` result;
- repository PNG/APNG/repaired/normalized counts;
- remaining errors/warnings + intentional accepted count;
- average APNG quality score;
- API health + APNG Lab desktop/mobile result;
- список исправленных корневых причин;
- readiness % и связность % на основании выполненных проверок.

## Правило 100%
Не писать 100%, пока одновременно не доказаны: локальные tests, repository corpus, GitHub CI, Chromium/Firefox/WebKit, Vercel Preview API/UI и отсутствие regression в общем проекте.
