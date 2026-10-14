# Движок

## Сборка: один модуль из многих файлов

`tools/build.py` склеивает `engine/*.js` **в порядке имён** в один ES-модуль. Паки (`packs/<id>/*.js`, по `order` из `pack.json`, затем по имени) вставляются **сразу после `05_registry.js`**: к этому моменту `define*()` уже существуют, а таблицы движка ещё не собраны. Каждый файл пака оборачивается в `{ … }` — свои `const` и функции у каждого файла, имена между паками не сталкиваются. Перед файлами пака — `packBegin(meta)`, после — `packEnd()`, так каждое определение знает свой пак.

Следствия:
- в паке доступны все глобали движка (`THREE`, `G`, `player`, `world`, `combat`, `foes`, `glow`, `dust`, `sprites`, `ribbons`, `C`, `rr`, `lerp`, `damp`, `clamp`…), но **вызывать** их можно только в коллбэках (`grow`, `think`, `onTick`, `draw`…), не на верхнем уровне файла: на момент загрузки пака объявлены лишь функции (они всплывают), а `const` модулей 09+ ещё не инициализированы;
- на верхнем уровне пака можно читать `REG` (например, скопировать определение базового врага и перекрасить: `packs/frost/enemies.js`);
- арт собирается отдельно (`art/build.py`) в `build/assets.json` и подставляется в бандл вместо `__ASSETS_JSON__`.

## Карта модулей

| Файл | Что делает |
|---|---|
| `00_head` | импорты three (CDN через import map), `ASSETS`, математика (`rr`, `lerp`, `damp`, `smooth`, `mulberry32`, шум) |
| `05_registry` | `REG`, `define*`, проверки, `on/emit` (хуки), `col3`, `hexCol`, `pick`, `easeIn/Out/InOut`, `span`, `ruPlural` |
| *паки* | всё содержимое игры |
| `09_blocks` | размеры мира, тайлы атласа `TL`, блоки `BLK[]` / `B.*` из реестра |
| `10_world` | генератор острова (детерминирован по seed): рельеф → холм маяка → пляж-спавн → тропа → пирсы → воксели → маяк → руины → скалы → флора → достижимость → монеты, сердца, оружие, алтари |
| `11_shrines` | места алтарей реликвий (свой поток случайности `gctx.rng('relics')`) |
| `12_mesher` | меш рельефа: скрытые грани, UV атласа, вершинный AO, листва |
| `15_glsl`, `16_glsl_fx` | шейдеры: вода, небо (облака, звёзды, луна, **сияние**), туман, пикапы, враги (дым/медуза), частицы, светлячки, пламя, кольцо, лучи, DOF, финальный грейд |
| `20_scene` | рендерер, текстуры (`HERO_TEX` — все листы героев), свет, вода, туман-слои, герой-билборд, пикапы, частицы `glow` (аддитивные) / `dust` |
| `22_post` | `EffectComposer`: bloom → DOF (tilt-shift) → output → финальный грейд (`FX`), `perf.scale` ≈ 0.8 разрешения |
| `25_palette` | фазы суток dusk → twi → night (+ dawn после победы), `biomePalettes()`, `applyPalette()` → `eventPalette()` |
| `30_state` | `G` (состояние партии), `C` (VFX-цвета), запросы к вокселям, `rayFree` |
| `32_audio` | `SFX` (синтез WebAudio, фоновые слои: волны, ветер, гул, **дождь, порывы**), `playSound(recipe)` |
| `35_hud`, `76_combat_hud` | сердца, монеты, миникарта, тосты; оружейная панель, хотбар, босс-бар, числа урона, карточка «новое…», арсенал в паузе (+ реликвии) |
| `37_input` | клавиатура, мышь, тач-стик, геймпад |
| `40_hero` | движение с инерцией, воксельная физика, `groundGrip()` (лёд), кадры анимации |
| `42_pickups`, `45_beacon` | монеты (магнит `STATS.magnet`), сердца, огонёк-спутник, маяк, кольцо |
| `47_camera` | тяжёлая камера: lerp-слежение, орбита по инерции, подъём при перекрытии, дыхание, тряска |
| `50_env` | рычаги пост-обработки по состоянию (опасность, урон, вспышки), атмосфера, падающие листья |
| `52_flow` | `buildWorld`, `resetRun`, title → play ⇄ pause → victory / defeat, рекорды |
| `60_sprites` | батч спрайтов из атласа оружия, ленты (`ribbons`, аддитивные) |
| `62_arsenal` | сборка оружия из реестра (`WEAPONS`, `ARSENAL_ORDER`), таблицы лута по биому, `RAR`, `toColor`, `PUV`/`ICON_UV` |
| `64_combat` | прицел, ближний бой (позы, комбо, рывки, удары по площади), стрельба (`fireRanged`, `spawnShot`, `addProj`) |
| `66_projectiles` | полёт снарядов по вокселям, рикошеты (`p.rc.hit`), попадания, взрывы, тесла, луч |
| `68_foes` | враги: спавн, `steerFoe`, урон, смерть, души, директор спавна, один инстансный рендер сегментов |
| `70_destruction`, `72_loot`, `74_fx` | рубка деревьев и сдувание листвы; лут; оружие в руке, следы, кольца, молнии |
| `80_characters` | персонажи, `STATS` (герой + реликвии), `selectCharacter`, фонарь `heroLight()` |
| `82_relics`, `84_npcs`, `86_events`, `88_menu` | реликвии и алтари; NPC и пузырь речи; погода и события; выбор острова и героя на титуле |
| `95_main` | кадр, старт, `window.__isle` |

## Кадр

```
dt = min(0.05, Δt) · G.timeScale   (hit-stop замораживает симуляцию, частицы ползут)
updateAim → updatePlayer → updateCombat / updatePickups / updateLoot / updateRelics   (в игре)
updateProjectiles → updateFoes (директор спавна, мозги, тела) → updateSouls → updateFx
updateFlow → updateEvents (событие, погода) → updateEnvironment (палитра + звук)
updateBeacon → updateCamera → updateHeroMesh → heroLight → updateNPCs → updateWisp → updateLeaves
sprites/ribbons: renderLoot, renderRelics, renderHeld, renderProjectiles, renderFx (+ brain.drawFx, body.drawFx), renderSouls
renderFoes → rebuildDirty → updatePost → updateHUD → updateCombatHud → updateNpcHud → composer.render
```
Всё анимируется от времени (`G.time`, `dt`), ни одного счётчика кадров.

## Реестр

`define(kind, id, def)`: id — `lower_snake_case`; обязательные поля проверяются сразу; повтор — ошибка, `override: true` — замена с наследованием полей. После загрузки паков движок «финализирует» таблицы и проверяет ссылки (анимации, снаряды, тела, мозги, арт, иконки, листы). Все ошибки — в `REG_LOG`, `__isle.registry()`, `tools/check.py`.

| Функция | Таблица | Финализация |
|---|---|---|
| `defineBlock` | `REG.blocks` | `09_blocks` → `BLK[]`, `B.ID` |
| `defineBiome`, `defineFlora` | `REG.biomes`, `REG.flora` | генератор, палитры |
| `defineWeapon`, `defineAnim`, `defineFire`, `defineRicochet`, `defineProjectile` | … | `62_arsenal` |
| `defineEnemy`, `defineBody`, `defineBrain` | … | `68_foes` (до 16 видов врагов) |
| `defineCharacter`, `defineRelic`, `defineNPC` | … | `80`, `82`, `84` |
| `defineEvent`, `defineWeather`, `defineSound` | … | `86`, `32` |

## Хуки

`on(event, fn)` из любого пака; ошибки внутри хука ловятся и пишутся в консоль, игра не падает.

| Событие | Аргументы | Когда |
|---|---|---|
| `boot` | — | реестр собран, до первого острова |
| `world` | `(ctx, stage)` | генерация: `'terrain'` (рельеф и пирсы готовы), `'decor'` (после флоры), `'done'` (всё размещено: `ctx.coins`, `ctx.loot`, `ctx.relicSpots`, `ctx.reach` …) |
| `run` | — | новая партия |
| `tick` | `(dt)` | каждый кадр боя |
| `coin`, `loot`, `relic` | предмет | подобран |
| `hit` | `(foe, dmg, opts)` | враг получил урон (`opts.w` — оружие героя) |
| `kill`, `spawn` | `(foe)` | |
| `hurt` | `(amount)` | герой ранен |
| `event` | `(ev, on)` | событие началось / закончилось |
| `win`, `die` | — | |

`ctx` генератора: `seed, biome, rand, R, RI, vox, hgt, stand, kind, at, ci, inb, role, W, D, H, SEA, BLOCKED, get, set, block, soilUnder, rng(tag), free, spawn, tower, flora, structures`. Для своих украшений берите `ctx.rng('мой_тег')` — это независимый поток: монеты и оружие не сдвинутся.

## Состояние

- `G` — партия: `state` (`loading | title | play | paused | dead | victory`), `biome`, `seed`, `time`, `play`, `collected/total`, `tod` (0 сумерки → 1 ночь, растёт с монетами), `dawn`, `danger`, `kills`, `warden`, `wardenDown` …
- `player` — `pos, vel, hp, maxHp, onGround, inWater, facing, look …`; `STATS` — множители героя и реликвий.
- `world` — результат генератора; `foes`, `projs`, `loot`, `relicSpots`, `npcs`; `combat` — арсенал, патроны, атака; `EVT` — событие (`cur`, `k` 0…1); `weather` — осадки.

## Визуальные рычаги

- **Палитра** (`25_palette`, блендится каждый кадр): `skyTop skyHor fog fogD keyCol keyI sunEl sunVis moonMix hemiSky hemiGnd hemiI deep shallow foam wSky bloom exposure motes flies mist mistCol stars wisp grain vig gain lift coinGlow beam halo aurora auroraA auroraB`. Биом переопределяет любые рычаги по фазам, событие тянет их к своим целям по `k`.
- **Финальный грейд** (`FX`, `22_post` + `50_env`): `uAberr` (хроматическая аберрация), `uGrain`, `uGlitch` (сдвиг строк), `uVignette`, `uDanger`, `uFlash` + `uFlashColor`, `uDesat`, `uBars` (киношные полосы), `uLift`, `uGain`, `uFade`. Bloom — `UnrealBloomPass`, всё ярче 1.0 светится.
- **VFX-цвета** `C.*` (линейные, часто ×2…4 для bloom): `gold goldHot ember wispCore wispHalo eye eyeGlow smoke spray sand dirt heart violet brass chip leaf flashWarm spark dash ice fire smokeLight zapCore zapGlow beamCore beamGlow orbCore orbHalo soul soulHalo hitSpark reticle lock white`. В определениях цвет можно задать `'#hex'`, ключом `C` (`'zapCore'`) или `[r, g, b, k]`.
- **Частицы**: `glow.emit(x, y, z, vx, vy, vz, life, size0, size1, color, alpha, gravity, drag, shape, floor)` (аддитивные), `dust.emit(…)` (обычные), `glow.spark(x, y, z, size, color, alpha)` — на один кадр. **Ленты**: `ribbons.seg(a, b, w0, w1, c0, a0, c1, a1)`. **Спрайты** из атласа оружия: `sprites.add(x, y, z, w, h, rot, uv, pivotX, pivotY, flipX, flipY, r, g, b, glow)`.

## Производительность

Только GPU: инстансинг (враги, монеты), одна облачная точка для осадков (вершинный шейдер оборачивает поле вокруг камеры), батчи спрайтов и лент, рендер-таргет ≈ 80 % (`perf.scale` подстраивается по FPS), без теней в реальном времени, без CPU-циклов по пикселям. Свет: два переиспользуемых вспышечных `PointLight` (`flashLight(pos, color, intensity)`) — число источников постоянно, шейдеры не перекомпилируются.

## `window.__isle`

`G, player, rig, perf, combat, aim, input, WEAPONS, ARSENAL_ORDER, world, foes, loot, projs, coins, REG, PACKS, STATS, BLK, relics, held, npcs, event`
и методы: `startGame() win() rebuild(seed, biome) character(id) registry() setTod(v) equip(id) cycleWeapon(d) giveAll() attack(on) aimAt(x, z) teleport(x, z) collectAll() foeNear(type, dx, dz, hold) killFoes() killWarden() boom(x, y, z) sim(dt, x, z, jump, fight) relicNear(id, dx, dz) giveRelic(id) npcNear(id, dx, dz) forceEvent(id) endEvent() noEvents(on) skyBolt(x, z)`.

## Инструменты

| | |
|---|---|
| `tools/build.py [--no-art]` | арт → `build/assets.json` (+ превью PNG в `build/`), бандл, `dist/index.html` и `dist/test.html`, `node --check` |
| `tools/check.py [--no-build] [--bot] [--update-baseline]` | реестр, хэши островов против `tools/baseline/worlds.json`, дымовой прогон каждого биома × героя в живом кадре (все события, реликвии, NPC, враги, всё оружие, страж) |
| `tools/bot.py [--biome ID] SEED…` | бот проходит остров: все монеты, всё оружие, все алтари, страж, победа |
| `tools/duel.py` | дуэли оружия против врагов |
| `tools/shots.py OUT TARGET…` | скриншоты и контакт-листы: `title play weapons weapon:ID enemy:ID biome:ID character:ID relic:ID npc:ID event:ID mobile boss` |
| `tools/new.py KIND ID` | заготовки контента (см. README) |
| `tools/bundle.py pack / unpack` | весь исходник одним JSON (`dist/source.json`) и обратно |
| `tools/run_js.py [--start] [--biome ID] FILE|выражение` | выполнить JS в игре и распечатать результат |

Стенд: Playwright + Chromium + SwiftShader (без GPU, медленно: кадр ≈ 0.05 с игрового времени). three берётся из `node_modules` вместо CDN, шрифты заглушены.
