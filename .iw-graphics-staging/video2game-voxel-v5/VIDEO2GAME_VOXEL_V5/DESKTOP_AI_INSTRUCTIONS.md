# DESKTOP AI — VIDEO2GAME VOXEL V5

## Цель
Внедрить V5 поверх существующего сервера как совместимый backend `video_to_voxel_game`.

## КРИТИЧЕСКОЕ ПРАВИЛО
**НЕ ОСТАНАВЛИВАЙСЯ, ПОКА НЕ НАЙДЁШЬ И НЕ ИСПРАВИШЬ ВСЕ ОШИБКИ.**

Нельзя завершать задачу при красном тесте, незагружаемом runtime, отсутствующем артефакте,
ошибке браузерной консоли, падении pipeline или regression gate.

## Как внедрять
1. Сделай резервную ветку/копию текущей версии.
2. Не удаляй существующие backend-ы.
3. Добавь `video2game_voxel` как отдельный backend.
4. Сохрани публичный контракт:
   - `manifest.json`
   - `scene_manifest.json`
   - `avatar.json`
   - `collision.json`
   - `navgrid.json`
5. Подключи V5 pipeline к входному одному видеофайлу.
6. Не включай платные/GPU зависимости как обязательные. Они только адаптеры.
7. CPU fallback должен всегда оставаться рабочим.

## Обязательный цикл проверки
Повторяй до полного GREEN:

1. `python -m compileall video2game_voxel`
2. `pytest -q`
3. `video2game-voxel input.mp4 --out build/game --config config.yaml`
4. Проверить наличие:
   - `PIPELINE_REPORT.json`
   - `VALIDATION_REPORT.json`
   - `QUALITY_GATE.json`
   - `REGRESSION_REPORT.json`
   - `public/assets/manifest.json`
   - `public/assets/scene_manifest.json`
   - `public/assets/avatar.json`
   - `public/assets/avatar_lods.json`
   - `public/assets/animation_library.json`
   - `public/assets/collision.json`
   - `public/assets/navgrid.json`
5. `cd build/game`
6. `npm install`
7. `npm run build`
8. `npm run dev`
9. Проверить браузер:
   - нет uncaught errors;
   - сцена видна;
   - персонаж виден;
   - WASD/стрелки работают;
   - мышь работает;
   - touch работает;
   - прыжок работает;
   - стопы не проваливаются ниже пола;
   - персонаж не проваливается под землю;
   - avatar LOD переключается;
   - чанки загружаются/выгружаются;
   - FPS отображается;
   - M переключает source motion.
10. Если любой пункт не PASS — исправить и вернуться к шагу 1.

## Критерий завершения
Только одновременно:
- compileall PASS
- pytest PASS
- pipeline PASS
- validation PASS
- quality gate GREEN
- regression PASS
- npm build PASS
- runtime smoke PASS

## Что запрещено ломать
- voxel/pixel style;
- CPU fallback;
- desktop/mobile controls;
- streaming;
- collision/navgrid;
- source motion;
- auto-tune;
- quality gates.

## Финальный отчёт десктопного ИИ
Указать:
- найдено ошибок;
- исправлено ошибок;
- осталось ошибок;
- какие тесты PASS;
- фактический FPS desktop/mobile;
- фактические проценты готовности;
- какие backend-адаптеры реально подключены.
