# WORLD_SERVER_GAME_MOTION_FRAME_TIMELINE_V2 — инструкция Desktop AI

## Миссия
Встроить в `World_server` **единую** игровую систему Game Motion / Frame Timeline / Procedural Animation V2 и затем использовать её во всех играх, где движение улучшает качество, **без дублирования существующих систем и без ухудшения физики/FPS**.

Исходная идея `roomwalk/exploded` расширена до игрового конвейера:
`gameplay signal → MotionGraph/Timeline/Spring/LocomotionClock → native animation OR frame sequence → adaptive quality → runtime evidence`.

## 0. Неподвижные правила
1. Работать в отдельной git-ветке. Не пушить напрямую в `master`.
2. Переиспользовать `WorldQualityAutopilot`, quality/regression gates, существующие animation validators.
3. Не останавливаться на установке файлов. Цикл:
   **внедрить → runtime проверить → найти первопричину → исправить → добавить регрессионный тест → повторить до PASS**.
4. Не использовать `SKIP`, чтобы скрыть ошибку патча.
5. Не заявлять 100% без реальных desktop + mobile/runtime evidence.
6. Если пользователь требует APNG — APNG сохраняется.
7. Визуальная анимация не имеет права ломать collision/root physics.

## 1. Preflight
В корне `World_server`:
```bash
git status
git rev-parse HEAD
git checkout -b ai/desktop/game-motion-frame-timeline-v2
node --version
python --version
git --version
```
Если рабочее дерево содержит чужие незавершённые изменения — не затирать их. Сохранить/отделить безопасно.

## 2. Установка патча
```bash
node "<ПУТЬ_К_ПАПКЕ_ПАТЧА>/install-game-motion-system.cjs" --root="<ПУТЬ_К_WORLD_SERVER>"
```
Инсталлятор idempotent: V1 policy заменяется V2, дубли команд не создаются, изменяемые файлы резервируются.

## 3. Скачать обязательные бесплатные/open-source инструменты
```bash
npm run animation:oss:bootstrap
```
Автоматически:
- создаётся `tools/game-motion/.venv`;
- ставятся Pillow + NumPy + imageio-ffmpeg;
- доступен FFmpeg без отдельной ручной установки в обычном случае;
- клонируется/обновляется MIT `Aironzak/instagram` как reference `roomwalk/exploded`;
- в изолированную `tools/game-motion/node/` ставятся MIT `@gltf-transform/cli` + `meshoptimizer`;
- проверяются Pillow/NumPy/FFmpeg/APNG и glTF CLI.

**Higgsfield не обязательный dependency.** Платные сервисы не должны блокировать систему.

Если bootstrap падает:
1. зафиксировать точную команду/ошибку;
2. исправить root cause;
3. повторить;
4. не заменять бесплатный обязательный инструмент платным.

## 4. Проверить upstream-обновления
```bash
npm run animation:oss:check
```
Проверяются: roomwalk, FFmpeg, imageio-ffmpeg, Pillow, NumPy, glTF-Transform, meshoptimizer, Godot.

Есть weekly GitHub Action `.github/workflows/game-motion-oss-watch.yml`.

Политика:
`обнаружить → license/changelog/security → candidate branch → install → animation:gate → runtime tests → release:gate → merge только при улучшении`.
Никакого blind auto-merge.

## 5. Аудит ВСЕХ игр перед изменениями
```bash
npm run animation:audit
npm run animation:plan
```
Изучить:
- `GAME_MOTION_OPPORTUNITIES.json`
- `GAME_MOTION_IMPLEMENTATION_PLAN.json`

**P0/P1** — внедрять во всех уместных местах, если runtime-проверка не показывает регресс.

Типовые области:
- персонажи: idle, ходьба/бег, ноги, оружие/щит, hit/death, вторичная анимация;
- механизмы: двери, шестерни, вентиляторы, поршни, колёса;
- окружение: деревья, трава, вывески, фонари, верёвки, цепи;
- эффекты: дым, пар, огонь, вода, пыль;
- камера: spring/inertia/impact/cinematic;
- разрушения/inspection: reversible `exploded`;
- птицы/NPC: MotionGraph state machine.

## 6. Важнейшее усиление персонажей
Использовать `LocomotionClock`: фаза walk/run считается **по реально пройденному расстоянию или скорости**, а не по случайному таймеру.

Это обязательный путь против:
- неподвижных ног;
- слишком быстрого/медленного шага;
- foot sliding.

Web:
```js
const clock = new GameMotionEngine.LocomotionClock({ strideLength: 1.1 });
const phase = clock.stepSpeed(actualSpeedMetersPerSecond, dt);
walkAnimation.seek(phase);
```
Godot/Roblox — использовать соответствующие адаптеры/native Animator.

## 7. MotionGraph
Для объектов с несколькими состояниями:
`idle → start → running → stop`, `ground → takeoff → fly → land`, `closed → opening → open → closing`.

Не создавать хаотические независимые tween-скрипты, если нужен state machine.

## 8. Central MotionScheduler + LOD
Много вторичных анимаций должны идти через общий scheduler и:
- снижать Hz через `WorldQualityAutopilot`;
- отключаться вне видимости/далеко от камеры;
- сохранять gameplay-critical motion на SAFE tier;
- уменьшать secondary motion раньше, чем основную анимацию персонажа.

## 9. Motion Manifest
Для повторно используемой сложной анимации создавать manifest:
```json
{
  "schemaVersion": "1.0.0",
  "game": "voxel-city",
  "motions": [{
    "id": "sign-wind",
    "target": "street.sign.*",
    "type": "sway",
    "trigger": {"source":"time"},
    "params": {"amount":0.03,"speed":0.9},
    "quality": {"secondary":true},
    "platforms":["web"]
  }]
}
```
Проверка/компиляция:
```bash
npm run animation:manifest -- path/to/motion-manifest.json
```

Готовые паттерны: `data/game-motion-presets.json`.

## 10. WebGL / Three.js
Dry-run:
```bash
npm run animation:integrate:dry
```
Проверить diff. Затем:
```bash
npm run animation:integrate
```

Semantic motion:
```js
mesh.userData.motion = { type: "sway", amount: 0.03, speed: 1.0 };
GameMotionThree.autoFromScene(scene);
```

`exploded`:
```js
const exploded = GameMotionEngine.createExplodedController(parts,{distance:2.5});
exploded.setProgress(gameplaySignal0to1);
```

## 11. Godot
Использовать `adapters/godot/GameMotionDriver.gd`.

Персонаж:
- native `AnimationTree/AnimationPlayer`;
- фаза шага привязана к реальной скорости;
- при наличии Skeleton/IK — native skeleton/IK предпочтительнее frame sequence;
- visual sway — visual child;
- CharacterBody/StaticBody collision root не двигать косметикой.

Физические двери/платформы: collision должен двигаться вместе с физическим объектом.

## 12. Roblox
Использовать `adapters/roblox/GameMotionDriver.luau`.

Персонаж:
- `Animator`, `Motor6D`, Bones;
- cadence привязана к `AssemblyLinearVelocity`/реальной скорости;
- не двигать `HumanoidRootPart` косметической анимацией.

## 13. Frame Timeline / APNG pipeline
Видео → PNG:
```bash
python tools/game-motion/extract_frames.py input.mp4 output/frames --fps 15
```

Анализ:
```bash
python tools/game-motion/analyze_sequence.py output/frames --output FRAME_SEQUENCE_QUALITY.json
```

Если есть exposure flicker:
```bash
python tools/game-motion/stabilize_exposure.py output/frames output/stable
```

Если нужно повысить кадровую плавность CPU-методом:
```bash
python tools/game-motion/interpolate_video.py input.mp4 output_30fps.mp4 --fps 30 --mode motion
```

Стык двух сегментов:
```bash
python tools/game-motion/blend_seam.py segment_a segment_b output/seam --frames 8
```

PNG → WebP:
```bash
python tools/game-motion/optimize_frames.py output/frames output/webp --quality 82
```

PNG → APNG:
```bash
python tools/game-motion/make_apng.py output/frames output/animation.png --fps 15
```

PNG → sprite sheet:
```bash
python tools/game-motion/pack_spritesheet.py output/frames output/sheet.png output/sheet.json
```

Frame timeline не использовать вместо native locomotion, если native animation даст лучшую интерактивность.

## 14. GLB / glTF анимации
Проверить tooling:
```bash
npm run animation:gltf:check
```
Оптимизация Meshopt:
```bash
npm run animation:gltf:optimize -- input.glb output.glb
```

**До/после обязательно проверить:**
- число/названия animation clips;
- skeleton/bones;
- morph targets;
- scale/root transform;
- визуально проиграть все клипы;
- размер файла/FPS/loading.

Если хоть один clip/rig сломан — откатить optimization и найти root cause.

## 15. Камера
Impact shake использовать через trauma model, не случайный каждый-frame jitter.
Кинематографическая камера — spring/easing.
На слабых телефонах secondary camera effects снижать, но управление камерой не должно становиться менее отзывчивым.

## 16. Проверка патча
```bash
npm run animation:verify
npm run animation:benchmark
npm run animation:gate
npm run check
npm run quality:world:animation
npm run release:gate
```

## 17. Реальные runtime-проверки каждой изменённой игры
Desktop:
- keyboard/mouse;
- FPS/jank;
- collision/jump;
- camera;
- animation correctness.

Phone:
- touch;
- portrait/landscape при необходимости;
- входные кнопки;
- FPS;
- нагрев/деградация качества;
- gameplay-critical animation остаётся читаемой.

Персонажи:
- ноги реально двигаются;
- cadence соответствует скорости;
- нет чрезмерного foot slide;
- оружие/щит остаются в руках;
- hit/death/state transitions корректны.

## 18. Evidence + обучение сервера
Создать/обновить `GAME_MOTION_RUNTIME_EVIDENCE.json` по шаблону:
`data/game-motion-runtime-evidence.template.json`.

После PASS:
```bash
npm run animation:knowledge
npm run quality:learn-fix
npm run regressions:capture
```
Успешные motion patterns и исправленные root causes сохраняются без дубликатов.

## 19. Если что-то сломано
Не обходить.
1. воспроизвести;
2. определить root cause;
3. исправить минимально и системно;
4. добавить unit/e2e/regression;
5. проверить соседние игры через dependency/impact systems;
6. повторять полный relevant gate до PASS.

## 20. Завершение
В отчёте:
- какие игры и объекты получили анимацию;
- какие P0/P1 opportunities закрыты;
- что не внедрено и почему;
- FPS/loading/size до и после;
- desktop/mobile evidence;
- найденные/исправленные ошибки;
- новые OSS версии;
- реальный % готовности.

```bash
git status
git diff --check
npm run animation:gate
npm run release:gate
git add .
git commit -m "Upgrade game motion and frame timeline system to v2"
git push -u origin ai/desktop/game-motion-frame-timeline-v2
```
Создать PR. Master напрямую не трогать.
