# World Evolution Engine — Cube → Living Voxel Diorama

## Цель

Каноническая цепочка:

`Cube → Voxel Matter → Terrain → Biome → Architecture → Materials → Lighting → Life → Simulation → Cinematic Camera → Final Frame`.

Главный контракт: финальная сцена не хранится как готовый набор мешей/вокселей/трансформов. `WorldEvolutionRecipe` содержит только seed, семантические параметры и timeline. Геометрия и поведение вычисляются генераторами World Server.

## Новый системный слой

- `lib/world-evolution.js` — нормализация Recipe, адресация времени `t=0..1`, stage-aware quality thresholds.
- `shared/world-evolution-runtime.mjs` — deterministic PRNG и browser-side generation plan для terrain/biome/architecture/life.
- `scripts/world-evolution-audit.js` — hard audit на one-seed, deterministic seed, отсутствие prebuilt payload, завершённый timeline и stage-aware quality probes.
- `scripts/world-quality-autopilot.js` — теперь включает World Evolution audit и публикует `evolutionPercent/evolutionHardGateReady`.
- `apps/cube-world-evolution-mvp/` — первый one-take proof.

## Как 10 блоков отражены в MVP

1. **World Growth / Morph** — timeline допускает выборку состояния для любого `t`.
2. **Voxel Matter** — поверхностные воксели рождаются из позиции исходного куба и летят/оседают в вычисленные target positions.
3. **Terrain + Biome** — relief, rocks, grass и trees вычисляются из seed.
4. **Architecture Compiler** — tower/arch собирается блоками из структурного правила с openings/door/windows/roof/path.
5. **Materials** — единый прототипный gray материал эволюционирует в earth/stone/wood/leaves/roof/glass-emissive.
6. **Lighting/Atmosphere** — directional sun, hemisphere, fog, exposure и background меняются по lighting stage.
7. **Living World** — walker и birds создаются только после life activation и реально движутся.
8. **World FX Interaction** — wind proxy влияет на grass/trees; дальнейший шаг — общий WindField для smoke/cloth/leaves.
9. **Cinematic One-Take Director** — 12 секунд, Catmull-Rom camera path, без монтажной склейки.
10. **Graphics Quality Governor** — intentional opening cube разрешён, поздний примитив получает `SEMANTIC_DETAIL_FAIL`, `MATERIAL_FAIL`, `LIGHTING_FAIL`, `CHARACTER_QUALITY_FAIL` или `ENVIRONMENT_COMPOSITION_FAIL`.

## MVP acceptance

- На `t=0` существует один примитивный cube.
- Recipe не содержит массив готовой сцены.
- Terrain/biome/architecture/life генерируются из seed.
- Same seed → same generated plan signature.
- Different seed → different signature.
- Stage progress не регрессирует.
- Late-stage quality failures включаются только когда соответствующая стадия реально активна.
- Page/canvas locked: no scroll, no overscroll, `touch-action:none`.
- Persistent debug HUD отсутствует; остаются только cinematic caption/progress и replay.

## Что уже переиспользовано, а не дублировано

World Evolution не заменяет существующие World Server systems: world-emergence, semantic-detail indexer, material synthesis, visibility optimizer, painting atmosphere и World Quality Autopilot. Он добавляет недостающий orchestration/time layer поверх них.

Следующий шаг интеграции после визуального принятия MVP: подключить Golden Painting Atmosphere напрямую, заменить локальные material targets на профили World Material Synthesis, а architecture stage кормить Semantic Detail Compiler вместо текущего компактного structural rule.

## Зафиксированные неудачи во время сборки и чему они научили

### Audit import path failure

Первый запуск standalone audit упал из-за неверного relative require `./lib/world-evolution` из каталога `scripts/`. Причина: audit проектировался отдельно от фактического repo path. Исправление: `../lib/world-evolution`. Вывод: любой новый governance script обязан реально запускаться из repo root до интеграции в autopilot.

### Overlapping quality-stage probe

После исправления import audit честно дал 80%, потому что на `t=0.84` уже активны одновременно material и lighting gates. Probe ожидал только `MATERIAL_FAIL`, но отсутствие lighting evidence корректно породило ещё и `LIGHTING_FAIL`. Исправление: при изолированном тесте одного домена остальные уже активные домены получают passing evidence. Вывод: stage-aware gates перекрываются во времени; regression probes должны явно изолировать проверяемый дефект.

После этих исправлений изолированный preflight: 5/5 unit tests PASS, World Evolution audit 100% READY. Это ещё не заменяет exact-head CI и browser/mobile visual proof.

## Известные ограничения первого MVP

- Это proof архитектуры, не полный 30-секундный фильм.
- Water/fire/smoke/cloth пока не входят в первый slice.
- Walker — процедурный voxel proxy; Golden universal character должен подключаться после доказательства orchestration.
- Browser visual quality и mobile FPS должны быть подтверждены свежим deployed smoke; до этого финальная пользовательская ссылка запрещена.
