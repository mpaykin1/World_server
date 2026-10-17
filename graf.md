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
