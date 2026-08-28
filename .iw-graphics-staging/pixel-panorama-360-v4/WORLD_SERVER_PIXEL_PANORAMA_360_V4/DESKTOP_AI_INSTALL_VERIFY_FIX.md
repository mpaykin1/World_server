# DESKTOP AI — INSTALL → VERIFY → FIX UNTIL PASS

## Главная цель
Внедрить V4 в настоящий `World_server` без удаления существующих систем. Не создавать вторую очередь: использовать уже существующую `services/ai3d-worker` SQLite/WAL durable queue.

## Строгое правило
Не останавливаться на первой ошибке. Исправлять первопричину, добавлять regression protection и повторять полный цикл до PASS.

## 1. Создай ветку
Пример:
```bash
git checkout -b ai/desktop/pixel-panorama-360-v4
```

## 2. Установи патч
Из корня `World_server`:
```bash
node /PATH/TO/WORLD_SERVER_PIXEL_PANORAMA_360_V4/install-pixel-panorama-360-v4.cjs --root .
```
Installer обязан создать backup в `.system-integration-backups/pixel-panorama-360-v4-*`.

## 3. Один раз установи бесплатные OSS
### Windows
```powershell
powershell -ExecutionPolicy Bypass -File tools/bootstrap-pixel-panorama-360-windows.ps1
```
### Linux
```bash
bash tools/bootstrap-pixel-panorama-360-linux.sh
```

Обязательные/полезные компоненты:
- ffmpeg — decode/encode APNG/GIF/video;
- ImageMagick — fallback и диагностика;
- sharp 0.35.3 — ставится `npm install`, основной быстрый CPU resize/tile path;
- oxipng — optional lossless PNG/APNG optimization;
- Python/Pillow/Numpy — worker mode и temporal validation.

## 4. npm install
Installer добавляет `sharp` в package.json. Выполнить:
```bash
npm install
```

## 5. Supabase migration
Применить:
`supabase/migrations/20260826011000_pixel_panorama_360_v4.sql`

Она создаёт:
- `pixel_panorama_projects`;
- публичный Storage bucket `panorama360`;
- read policy metadata;
- индексы.

## 6. Worker integration check
Проверить:
```bash
python -m py_compile services/ai3d-worker/server.py services/ai3d-worker/ai3d/runner.py services/ai3d-worker/ai3d/plugins/pixel_panorama_360.py
```
Worker `/health` должен содержать `pixel_panorama_360.available=true` при наличии Pillow + ffmpeg. Если worker живёт на отдельном Linux-хосте, один раз запусти там `bash services/ai3d-worker/scripts/bootstrap-pixel-panorama.sh`.

## 7. Sample build
```bash
npm run panorama360:sample:build
npm run panorama360:validate
```
Открыть:
`/apps/pixel-panorama-360/?manifest=/shared/panorama360/sample-pixel-world/manifest.json`

## 8. Тесты
```bash
npm run check
npm run panorama360:tools:verify
npm run panorama360:validate
npm run panorama360:temporal
npx playwright test e2e/pixel-panorama-360.spec.js --project=desktop-chromium
npx playwright test e2e/pixel-panorama-360.spec.js --project=mobile-webkit
npx playwright test e2e/pixel-panorama-360.visual.spec.js --project=desktop-chromium --update-snapshots
# визуально проверить новый baseline, затем обязательно повторить без --update-snapshots:
npx playwright test e2e/pixel-panorama-360.visual.spec.js --project=desktop-chromium
npm run panorama360:release:gate
```

## 9. Проверка durable worker path
Через `/apps/pixel-panorama-360/` в секции Factory:
1. Выбрать ZIP/APNG/GIF/MP4/WebM или 2:1 PNG.
2. Нажать `Создать на сервере`.
3. Убедиться, что job переходит `queued → running → completed`.
4. Перезапустить worker во время тестового job и проверить recovery на тестовой среде.
5. Result ZIP должен скачиваться через authenticated worker file endpoint.

## 10. Supabase publish
После локальной сборки:
```bash
node scripts/pixel-panorama-360-publish-supabase.cjs --slug sample-pixel-world
```
Проверить публичный remote manifest URL из отчёта.

## 11. Tour editor
Открыть:
`/apps/pixel-panorama-360/editor.html?manifest=/shared/panorama360/sample-pixel-world/manifest.json`
Добавить hotspot, экспортировать `hotspots.json`, положить рядом с source frames и пересобрать.

## 12. Preview / production
На preview URL:
```bash
node scripts/pixel-panorama-360-prod-verify.cjs --base-url https://PREVIEW_URL --manifest /shared/panorama360/sample-pixel-world/manifest.json
```
После PASS production — повторить на production URL.

## 13. Certification
Только после desktop + mobile + worker + preview PASS:
```bash
npm run panorama360:certify
```
До этого app остаётся `candidate`, `visible:false` в deny-by-default catalog registry.

## Ошибки, которые не должны вернуться
- blurred pixels / linear filtering;
- 2:1 violation;
- seam 0°/360° visible tear;
- giant 8K file blocks first paint;
- full HQ sequence загружается на телефон сразу;
- touch look/pinch конфликтуют;
- worker принимает panorama mode, но падает на content type;
- job теряется после restart;
- catalog показывает app до certification;
- Supabase remote manifest содержит локальные `/shared/...` URL;
- duplicate registry entries;
- temporal flash/outlier не выявляется validator-ом.

## Rollback
Восстановить файлы из последнего `.system-integration-backups/pixel-panorama-360-v4-*` и удалить новые V4-only файлы при необходимости.

## Optional: open-source generative panorama adapter
V4 includes `scripts/pixel-panorama-360-generator-router.cjs`. It deliberately refuses to invent a result until `PIXEL_PANORAMA_GENERATOR_URL` points to a real open-source generator endpoint (for example a compatible ComfyUI/API wrapper). This keeps the system honest on a CPU-only setup. After connecting such an endpoint, the router requests a seamless 2:1 pixel-art equirectangular image, then the normal CPU animator/build/quality pipeline can process it.
