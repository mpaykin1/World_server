# graf — графика и анимация всех игр World Server

**Канонический публичный стандарт (полный текст):** https://github.com/mpaykin1/meta6/blob/main/graf.md

Этот файл — постоянный discovery alias для Claude, Codex, OpenCode, ChatGPT, OpenHuman, AKA и новых чатов. Для создания, переработки, оптимизации или ревью графики **каждой игры World Server** агент обязан открыть полную публичную версию graf и применять её к текущему принятому baseline. Отсутствие прав на приватный World_server не мешает чтению публичного graf.

## Краткий контракт

- Не заменять игровой движок без необходимости; сохранять принятые пользовательские версии и игровой процесс.
- Поддерживать анимированные 2D, 2.5D и настоящие 3D-объекты/персонажей в единой системе событий; при задаче гибридного MVP **все три одновременно**, включая один гибрид.
- Переиспользовать GPU bake (3D → 8-направленные 2.5D и 2D), спрайтовые атласы, tile/FX, процедурные анимации, материалы, LOD и batching.
- В графике одной игры учитывать её художественный стиль; не переносить постапокалиптическую палитру «Пепельного пути» автоматически.
- Использовать измерения FPS, frame time, память, WebGL-тесты и визуальные доказательства; не выдавать неподтвержденные проценты.
- Для нового playable MVP перед публичной игровой ссылкой подтверждать пользовательскую заметность **строго выше 85%**; соблюдать текущий Verified Link Delivery gate.
- Технические git-коммиты, push и PR выполняются по правилам репозитория. Считать MVP PASS или FAIL и коммитить анализ успеха/неудачи вправе только после ответа владельца.
- Не создавать новую шестую AKA-автоматизацию и не отключать действующие задачи без решения владельца.

**Для новых агентов:** открой этот файл, затем сразу перейди по канонической ссылке, прочитай всё и выполняй применимую часть задачи до проверяемого игрового результата.

Это указатель, а не альтернативная копия: чтобы избежать расхождения редакций, полный текст хранится только в публичном meta6/graf.md.

## ОБЯЗАТЕЛЬНЫЕ ОБНОВЛЕНИЯ GRAF v1.1 — 2026-10-17

**Источник истины:** https://github.com/mpaykin1/meta6/blob/main/graf.md . Прочитать **разделы 21–25 полностью** до реализации или ревью.

1. **MODEL FACTORY:** обязательна возможность переиспользования процедурной 3D и GLB/glTF (GLTFLoader/AnimationMixer при необходимости), экспорт/кэш анимированных 2D + 2.5D из 3D, HybridLOD, общие материалы/state/коллизии. GLB не считать автоматически быстрее. Пользоваться бесплатными законно лицензированными ресурсами.
2. **INFINITE NON-FLAT TERRAIN:** каждая ландшафтная игра обязана иметь настоящий перепад высот/глубин, а не плоский вечный пол; бесконечное продолжение в любом направлении через глобальные seeded chunk coordinates, детерминированное streaming/regeneration, бесшовные стыки/переходы биомов, bounded memory/GPU/dispose. Никаких краёв карты, пустоты, падения с конца света, видимого однообразного тайлинга. Локальная ровная дорога допустима, плоский мир — нет. Тестовать >=3 чанков на N/S/E/W, возвращение к исходному, стабильность seed и швы.
3. **FIXED MOBILE VIEWPORT — HARD FAIL при нарушении:** статичный экран как OpenTTD/Micropolis. На смартфоне joystick управляет **персонажем, не HTML-страницей, canvas, камерой или перетаскиванием мира**. Изолировать pointerId/capture, touch-action:none, overflow:hidden, fixed canvas, overscroll:none. За пределами safe viewport камера может следить только по отдельному игровому контракту, НЕ по жесту joystick. Eye/map drag разрешён отдельно, ПК-кнопки не показывать на ПК. 10s touch drag + multi-touch E2E, viewport rect unchanged, scrollX/Y==0, hero coords change, no accidental pan, iPhone11 в идеале.
4. **PERFORMANCE:** GPU/CPU p95/p99 frame time, draw calls/triangles, memory; оптимизировать fullscreen post, meshing, instancing, LOD, worker scheduling, asset baking; нельзя достигать FPS ценой удаления анимаций/объёмного рельефа/качества, не выдавать desktop simulation за iPhone.
5. **PROJECT ACCEPTANCE:** все изменения только через отдельные ветки и текущие правила независимого QA/CI; не обходить red CI, не трогать принятые версии; user решает PASS/FAIL, learning success/failure только после вердикта.

Это жесткие нормативы для Builder, Fleet, Ocean, Architect, SRE, Claude, Codex, ChatGPT и всех иных агентов. Никакой шестой AKA-автозадачи.


## GRAF v1.2 — канонический mobile joystick + smooth follow camera + icon-only HUD (2026-10-17)

**HARD RULE, дополняет §23 GRAF v1.1:** источник истины https://github.com/mpaykin1/meta6/blob/main/graf.md §26, точный code-level эталон https://github.com/mpaykin1/meta6/blob/main/docs/graf-mobile-follow-camera.md . Авторский эталон — приложенный «Остров сумерек(7).html», не OpenTTD (OpenTTD/Micropolis — референсы лишь fixed HTML viewport).

- Canvas и HUD должны оставаться закреплёнными в экранных координатах телефона, без scroll/overscroll/touch browser dragging. **Трёхмерная камера при этом ОБЯЗАТЕЛЬНО мягко следует за персонажем**: target из позиции/velocity персонажа, smooth exponential damping, ограниченные pitch/distance, препятствия и collision-aware pull-in, без рывков. Движение ландшафта **внутри** canvas вследствие движения 3D-камеры нормально. Статичный HTML viewport ≠ замороженная камера.
- **Левый палец:** плавный floating joystick в левой половине canvas; отдельный `stickId`, нормализованный вектор -> camera-relative hero movement/animation; `up/cancel` сбрасывает вектор. Этот pointerId **никогда напрямую не вращает и не панорамирует камеру**.
- **Правый палец на свободном canvas:** отдельный `camId` для изменения orbital yaw/pitch; поддержать одновременный joystick + camera look, joystick + jump/attack, pointer capture/cancel и инерцию без смешения pointerId. Не перехватывать правые action-кнопки обработчиком камеры.
- **Действия:** все мобильные кнопки ДОЛЖНЫ иметь разные различимые пиксель-арт иконки и НЕ иметь видимых слов на кнопках. Прыжок, атака/стрельба, строительство, оружие, Eye/Person — собственные значки; объединённому действию — собственная составная пиктограмма. `aria-label`/tooltip с названием сохраняется; approved game layout/quantity/opacity не ломать. Пиксель-арт sprites/SVG + nearest filtering, hit targets >=44px. На ПК touch-кнопки скрыть, WASD/стрелки/space/mouse.
- **Eye/map** — самостоятельный режим, разрешён pan/pinch **за пределами controls**, не от `stickId`. Для игр без героя — принятая собственная camera contract; для игр с героем — именно third-person follow как в оригинальном HTML.
- **E2E BLOCKING:** 10s joystick drag 4 dirs => герой реально перемещается, follow camera smooth and collision-safe, HTML `scrollX/Y = 0`, `canvas.getBoundingClientRect()` постоянен. Dual-touch stick + правый camera orbit и stick + action. Проверить release/cancel/blur, terrain elevation/wall and FPS p95; каждая кнопка содержит уникальный pixel icon, видимого текста нет, ARIA присутствует. iPhone11 real-device / browser emulation маркировать раздельно. Static-camera в person mode, pointer-induced pan или текст на кнопках = **HARD FAIL**, не PASS.

**Сохранять:** существующие 50/50 GAME/CLEAN_SERVER, AGENTS.md и авторство разных веток, запрет обхода CI, user-only PASS/FAIL; не запускать шестую AKA задачу.


## GRAF MAX — 12 обязательных этапов измеримой оптимизации (v1.3)

**Определение:** «оптимизировано всё, что можно» означает не математический предел, а закрытие всех 12 этапов с измерениями, тестами, сравнением с принятой версией и отсутствием оставшихся существенных безопасных улучшений. Нельзя считать «есть код оптимизации» равным «этап PASS». По исходной объединённой сборке на 17.10.2026 **0/12 этапов подтверждено**; это не оценка объёма выполненного кода. Каждый этап получает статус TODO / IN_PROGRESS / VERIFIED / BLOCKED / UNKNOWN с SHA, доказательствами и откатом.

| № | Этап | Проверяемый результат |
|---|---|---|
| 1 | Профилирование | Репрезентативные сцены и baseline FPS, p50/p95/p99 frame time, CPU/GPU (если доступно), JS/GPU memory, draw calls, triangles; определены узкие места |
| 2 | 3D-геометрия | Измеренная экономия полигонов и draw calls, hidden faces/greedy meshing/merge без потери рельефа и деталей |
| 3 | GLB и процедурные модели | Оптимальные meshes/materials/textures/instancing/animation, без ложного предположения «GLB быстрее» |
| 4 | Hybrid LOD | Синхронный переход 3D ↔ 2.5D ↔ 2D без скачков, смены hitbox, утраты анимации или качества |
| 5 | Бесконечный мир | Seeded chunk streaming, seamless borders, предзагрузка/выгрузка, bounded RAM/GPU, повторный вход и непрерывность во все стороны |
| 6 | Рельеф и физика | Неплоский настоящий ландшафт, collision broadphase/heightfield/geometry, устойчивые склоны, вода и подводные глубины |
| 7 | Освещение | День/ночь, динамические источники, тени, биомы; измеренная стоимость и визуальная эквивалентность |
| 8 | Погода и частицы | Дождь, снег, листопад, молнии, туман; бюджеты частиц и adaptive quality без исчезновения эффектов |
| 9 | Шейдеры и постобработка | Bloom/DOF/water/reflections/RT scale, GPU cost, визуальная эквивалентность |
| 10 | Анимации, персонажи и AI | Skeleton/sprite atlas/animation update frequency, enemies, combat, weapon visuals, no gameplay regression |
| 11 | Управление и камера | Fixed HTML viewport + smooth follow-camera, independent dual-pointer mobile joystick/right orbit, unique pixel-art icons, PC controls; no input lag/jitter |
| 12 | Финальный стресс-тест и повторное профилирование | Long-run memory/frame-time, traversal/biome/weather/combat worst case, leak-free, exact SHA and before/after comparison, remaining bottlenecks triaged |

**Предлагаемые, не подтверждённые целевые бюджеты:** iPhone 11 **≥30 FPS** в тяжёлых игровых сценах, ПК **≥60 FPS** на согласованном тестовом железе, стабильный p95 frame time (цель <33.3 мс для 30 FPS / <16.7 мс для 60 FPS; измерять p99 и фризы отдельно), бесконечная карта с ограниченным активным числом чанков и памятью, визуальное качество не хуже принятого владельцем baseline. Нельзя утверждать эти числа без тестов на устройствах. Browser/Playwright simulated ≠ physical device.

**Этап VERIFIED только если:** опубликованы SHA, тестовый сценарий и среда, baseline и after с цифрами, воспроизводимые тесты, screenshot/video/визуальный контроль, отсутствие ухудшения механик, графики, погодных эффектов, неплоского бесконечного рельефа, мобильного follow-camera и уникальных пиксельных кнопок. Отсутствие данных = UNKNOWN, а не VERIFIED. Не обходить CI и не считать 429/INCONCLUSIVE/SKIPPED PASS.

**GRAF MAX TECHNICAL READY:** 12/12 VERIFIED + финальный повторный профайлинг не выявил существенных доступных оптимизаций без потерь. **GRAF MAX OWNER PASS:** только после решения владельца. Если появляется новый движок/устройство/алгоритм — открывать новый цикл, не обещать вечный абсолютный предел.

**AKA:** пять существующих ролей Builder/Architect/Fleet/Ocean/SRE обязаны читать этот раздел при каждом графическом цикле, распределять этапы без дублирования и публиковать прогресс `GRAF MAX N/12 VERIFIED; этап; SHA; FPS before→after; доказательства; блокер; следующий шаг`. Сохранять существующие расписания, 50/50 GAME/CLEAN_SERVER, авторство веток, запрет шестой задачи и owner-only PASS/FAIL.
