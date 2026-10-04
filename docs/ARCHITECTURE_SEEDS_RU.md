# Architecture Seeds — детерминированная архитектура World Server

## Что это

Architecture Seeds расширяет существующий `worldSeed`: один точный `seedKey` задаёт не только terrain/biomes, но и архитектурную ДНК мира.

Каноническая цепочка:

```
seedKey
  -> versioned sub-seeds
  -> architecture family / blend
  -> road + district plan
  -> building grammar
  -> constraint-collapsed facade
  -> biome/history modifiers
  -> voxel materialization
```

Большие числовые сиды хранятся строкой, поэтому значения за пределами безопасного JavaScript Number (например `-3361685360695458093`) не теряют точность. Для старого voxel terrain отдельно выводится стабильный 32-bit lane.

## Поддерживаемые семейства

- `gothic`
- `new_york`
- `ancient_chinese`
- `tokyo`
- `future`

Семейства можно смешивать через текстовую идею. Биомно-исторические модификаторы: `jungle`, `flooded`, `ruins`, `desert`, `snow`, `volcanic`, `islands`.

## Основные файлы

- `lib/architecture-seeds.js` — Architecture DNA, sub-seeds, city plans, building recipes, Seed Hunter.
- `lib/architecture-grammar.js` — детерминированный constraint-collapse для архитектурных модулей.
- `shared/architecture-seed-runtime.js` — browser voxel materializer.
- `lib/world-factory.js` — сохраняет `seedKey` и Architecture DNA в World DNA.
- `lib/api-handlers/world-factory.js` — create / preview-seed / hunt-seeds.
- `scripts/architecture-seed-hunt.js` — CLI.
- `test/architecture-seeds.test.js`, `test/architecture-seed-runtime.test.js` — regression coverage.

## API

### Создать мир с точным seed

POST `/api/world-factory`

```json
{
  "action": "create",
  "requestId": "<uuid>",
  "idea": "затопленный готический город в джунглях",
  "seed": "-3361685360695458093"
}
```

### Предпросмотр без сохранения

```json
{
  "action": "preview-seed",
  "seed": "350362654",
  "idea": "Tokyo flooded ruins",
  "x": 0,
  "z": 0,
  "size": 256
}
```

Возвращает Architecture DNA, city plan и детерминированные building samples.

### Найти интересные seeds

```json
{
  "action": "hunt-seeds",
  "startSeed": "1000",
  "count": 1000,
  "limit": 12,
  "idea": "future flooded ruins",
  "criteria": {
    "family": "future",
    "modifiers": ["flooded", "ruins"]
  }
}
```

Seed Hunter ранжирует не только совпадение фильтра, но и морфологию: verticality, density, courtyard bias, symmetry extremes, age/reconstruction и редкие road patterns.

CLI:

```bash
npm run seed:hunt -- --start 1000 --count 1000 --limit 12 --idea "future flooded ruins" --family future --modifier flooded,ruins
npm run seed:hunt -- --preview --seed -3361685360695458093 --idea "gothic flooded jungle city"
```

## Версионирование

`generator.version` входит в Architecture DNA. Старые сиды нельзя молча пересчитывать новым алгоритмом. При несовместимой эволюции генератора создаётся новая версия; предыдущая остаётся воспроизводимой.

## Open-source исследования и что именно перенесено

В этом slice **не vendored чужие sample assets и не копируется чужой игровой контент**. Мы проверили лицензии и реализовали совместимую собственную JS-систему, используя общие алгоритмические идеи.

### OpenCityMaker — MIT

https://github.com/derek-wangpch/OpenCityMaker

Полезное: city/style model factories, модульная процедурная архитектура, разделение архитектурных семейств. В World Server перенесён сам подход к family grammar; чужие модели не требуются runtime.

### WaveFunctionCollapse — MIT

https://github.com/mxgmn/WaveFunctionCollapse

Полезное: constraint propagation / entropy collapse. В World Server реализован собственный небольшой deterministic constraint-collapse в `lib/architecture-grammar.js`.

Важно: upstream LICENSE отдельно говорит, что предоставленные image samples и tiles **не входят** в лицензию WFC software. Эти sample assets не импортируются.

### city-pcg — MIT

https://github.com/jason9075/city-pcg

Полезное: `same seed + same params = same city`, staged city generation, roads/density/buildings. В World Server это отражено в versioned Architecture DNA, city-plan и Seed Hunter.

### procedural-buildings — MIT

https://github.com/JUST0M/procedural-buildings

Полезное: архитектурная grammar и композиция зданий из структурных правил. В World Server используется собственная family/building grammar без зависимости от upstream runtime.

### Terasology Cities — Apache-2.0

https://github.com/Terasology/Cities

Полезное: procedural city/road/settlement generation и rasterization в voxel-like world. В World Server это отражено в city-plan -> browser voxel materializer.

### FastNoiseLite — MIT

https://github.com/Auburn/FastNoiseLite

Полезное: независимые noise lanes для world features. World Server уже имел собственные `valueNoise/fbm/hash32`; поэтому FastNoiseLite не vendored, а Architecture Seeds использует независимые versioned sub-seeds и сохраняет существующий terrain generator.

## Безопасность совместимости

- Если у старого мира нет `worldDNA.architecture`, `ArchitectureSeedRuntime` возвращает `null` и не меняет его chunks.
- Player overrides применяются после procedural generation и остаются авторитетными.
- Existing controls/collision/mobile code не заменяется Architecture Seeds.
- Architecture runtime использует существующие voxel block types; отдельный тяжёлый engine dependency не добавлен.

## Что считать доказанным сейчас

Доказано unit/regression тестами: детерминизм DNA, точность больших seedKey, style/modifier detection, deterministic building recipes, constraint facade rules, city-plan differences, Seed Hunter ranking, World Factory persistence/preview, browser runtime determinism, legacy-world no-op.

Визуальное качество каждого архитектурного семейства на физическом устройстве — отдельный visual acceptance gate. Этот документ не маркирует систему SUCCESS/FAILURE: такой verdict фиксируется только после решения пользователя.
