# Контент: все типы и поля

Каждый тип — вызов `defineX('id', { … })` в любом файле пака. Заготовка любого типа: `python3 tools/new.py KIND ID --pack PACK`.
Живые примеры — в `packs/base`, `packs/frost`, `packs/deep`, `packs/keeper`. Цвет в любом поле можно дать как `'#hex'`, ключ `C` (`'zapCore'`) или `[r, g, b, k]` (линейный, `k` — яркость для bloom).

---

## Арт (Python, `packs/<pack>/art/*.py`)

```python
from art.pixel import S, N, Y, new, m_ellipse, paint_round, outline, make_ramp
from art.registry import tile, weapon, projectile, icon, hero, strip_art

@icon("moon_pearl")                 # 16×16 → иконки реликвий
def moon_pearl():
    c = new(16)
    paint_round(c, m_ellipse(8, 8, 5, 5, 16), make_ramp("#9fd8ff"), 8, 8, 5)
    return outline(c)
```

| Декоратор | Размер | Что вернуть | Куда попадает |
|---|---|---|---|
| `@tile(name)` | 16×16, бесшовный, без обводки | массив RGBA | атлас блоков, `tiles` у `defineBlock` |
| `@weapon(name)` | 32×32 | `(массив, dict(grip=(x, y), tip=(x, y), muzzle=(x, y)?, base=45 | 0))` | атлас оружия; `base=45` — ближний бой нарисован по диагонали (рукоять внизу слева), `base=0` — ствол вправо |
| `@projectile(name)` | 16×16 | массив | `PUV[name]` |
| `@icon(name)` | 16×16 | массив | `ICON_UV[name]`, иконки HUD |
| `@hero(name)` | 96×24 (6 кадров 16×24: шаг ×4, стойка, прыжок) | `sheet(Spec(…))` | `HERO_TEX[name]` — герои и NPC |
| `@strip_art(name)` | любой | массив | `ASSETS[name]` |

Персонажи собираются из скелета героя (`art/character.py`): `Spec(colors=…, head=[7 строк], scarf=[2], torso=[4], tails=… | None, legs={поза: строки}, extras=[(row, col, rows) | f(i, frame)], behind=[…], extra_colors={буква: '#hex'}, poses={4: {'near': 'fwd'}})`. Буквы: `H h j` волосы, `S s k` кожа, `e` глаз, `R r q` шарф, `T t u` одежда, `B` пояс, `y` пряжка, `P p` штаны, `D d c` ботинки. Примеры: смотритель с фонарём (`packs/keeper/art/keeper.py`), призрак и рыбак (`packs/base/art/npcs.py`).

---

## Блоки — `defineBlock`

| Поле | |
|---|---|
| `name` | имя |
| `tiles` | `'tile'` или `{ top, side, bottom }` (тайлы любого пака) |
| `sideCovered` | тайл бока, когда сверху другой блок (трава → земля) |
| `mm` | цвет на миникарте |
| `step` | вид шагов → звук `step_<вид>` (`soft`, `stone`, `wood`, `snow`, `ice`…) |
| `dust` | цвет пыли из-под ног |
| `leafy` | листва: прозрачна для камеры, сдувается взрывом, срубается |
| `trunk` | ствол |
| `tint` | `[яркость, глубина AO]` |
| `slip` | 0…1 — скольжение (лёд `0.85`) |

## Биомы — `defineBiome`

| Поле | |
|---|---|
| `name`, `short`, `desc`, `lede` | имя, подпись на титуле, подсказка, строка под логотипом |
| `blocks` | роли: `top soil deep beach path plaza wall pier post rock tower towerCap towerTop door` |
| `terrain` | `{ height, base, hills }` — высота и холмистость |
| `flora` | `[{ type, count, tries, spacing, minHeight, …опции роста }]` |
| `rocks`, `ruins`, `piers`, `shrines` | сколько скал, руин, пирсов, алтарей |
| `leafColors` | что сыплется с крон |
| `palette` | `{ dusk, twi, night, dawn }` — переопределения рычагов (см. ENGINE.md → Визуальные рычаги) |
| `weather` | `{ kind, density, wind: [x, z] }` — погода по умолчанию |
| `ambience` | `{ waves, wind, drone, rain, gust }` — множители фоновых звуков |
| `guardian` | id босса (по умолчанию `warden`) |
| `foes` | `{ id: множитель }`, `0` — запретить |
| `events` | список разрешённых событий (если не задан — все, чьи `biomes` подходят) |
| `onTerrain(ctx)`, `decorate(ctx)` | свои постройки до/после флоры (`ctx.rng('тег')` — независимая случайность) |

## Флора — `defineFlora`

`{ name, footprint, minHeight, choppable, blocking, grow(ctx, x, z, h, opt) → { th, crownY } }` — пишет воксели через `ctx.set` (записываются, поэтому срубленное дерево исчезает точно). Пример — ели (`packs/frost/flora.js`).

---

## Оружие — `defineWeapon`

Общее: `name, kind ('melee' | 'ranged'), rar (common | rare | epic | legend), stat, desc, held (размер в руке), loot ({ near: true } | { tier: N }), starter, biomes, art (если имя арта другое), glow, sparkle { at: 'tip' | 'muzzle', col, rate, rise }, heldFx(w, draw), hideHeld(w) → true (рука пуста), meter() → { fill, text, state }, sfx (рецепт или (k) => рецепт)`.

Ближний бой: `anim, dmg, cd, dur, reach, arc (°), kb, combo, fin { mul, kb, over, dash }, slow, trail (цвет следа), crit, critMul, burn { dps, t }, leech, stun, aoe { r, mul }, chop (рубит деревья), hitstop, flame, onHit(foe, segment)`.

Стрелковое: `fire, proj, dmg (или [min, max] при натяжении), charge (сек натяжения), cd, speed, grav, life, size, r, ric, bounce, rest, pierce, rehit, mag, reload, regen (сек на патрон), spread, pellets, auto, casing, tracer, color, flash (false | { col, light, big, smoke }), kick, recoil, freeze, aoe, foeBounce, chargeArt, spinReload, range/jumps/jumpR (тесла), dps/reflect/heat/cool (луч)`.

### Анимации ударов — `defineAnim`
`pose(w, t, step, fin) → { ang, push, active }` (t — 0…1 доля удара), `trail: 'arc' | 'streak' | 'none'`, `lunge: [обычный, финишер]`, `swing` (вес свиста), `impactAt` + `impact(atk)` (момент удара о землю), `trailWindow`, удержание: `hold: true` + `update(dt, w)` + `render(w, hand, draw, li)` + `meter(w)` (цеп).

### Режимы стрельбы — `defineFire`
`trigger(w, origin, dir, charge)` — один выстрел (`spawnShot` даёт снаряд из полей оружия); `continuous: true` + `update(dt, w)` — луч.

### Снаряды — `defineProjectile`
`draw(p, li)` (спрайт), `tracer(p)` (ленты), `trail(p) → сек до следующей частицы`, `impact(p)`, `expire(p)`, `steer(p, h)` (самонаведение, возврат), `through(p)` (проходит сквозь воксели), флаги `noWater, splash, alwaysRicochet, passOrbs, loudRicochet, stickDust, stickGlow`. Поля снаряда: `p.pos, p.vel, p.age, p.life, p.w (оружие), p.hit, p.dead …` — можно добавлять свои (`p.ret` у бумеранга).

### Рикошеты — `defineRicochet(id, (p, comp, speed) => умер?)`
`comp` — заблокированная ось. Готовые: `none mirror scatter damped roll stick boomerang`. `ricochetFx(p, comp)`, `impact(p)` — помощники.

---

## Враги

### `defineEnemy`
`name, body, brain, boss, hp, dmg, seg (сегментов), rad, spacing, hover, wander, chase, chaseR, soul (шанс души), soulEvery (босс: душа каждые N урона), danger, eye, eyeGap, dissolve, trailEvery, riseY, riseTime, kbTaken, stunTaken, downText, onDeath(f)` и

- `look: { core, rim, aura, spikes, pixels (сетка силуэта), auraGain, style (0 дым · 1 колокол медузы), eye, eyeGlow, death, …свои (tent) }`;
- `spawn: { from: 'sea' | 'land' | 'guardian', priority, every, dist: [min, max], max(ctx) → сколько держать, biomes, onSpawn(f), place() }`, `ctx = { play, collected, total, all, tod, night, biome, prog, kills }`.

Вариант существующего врага — копия с правками: `defineEnemy('frost_imp', Object.assign({}, REG.enemies.get('imp'), { look: …, spawn: … }))`.

### Тела — `defineBody`
`init(f, x, y, z)` (наполняет `f.segs`, `f.rads`), `step(f, dt, s)` (исполняет намерение мозга; `steerFoe(f, dt)` — инерционное руление), `follow(f, dt)` (пока растворяется), `touch(f, px, py, pz) → индекс | -1`, `trail(f, dt)`, `render(f)` (`putSegment(f, x, y, z, r, alpha, seed)`, `drawEyes(f, at, r)`), `drawFx(f)` (ленты/частицы каждый кадр). Примеры: `serpent` (base), `jelly` (deep).

### Мозги — `defineBrain`
`think(f, dt, s)` пишет намерение: `f.target, f.speed, f.turn, f.ty, f.yk, f.arrive, f.harmful`; `s = { px, py, pz, dxp, dzp, dist, prog, canChase, chaseR }`. Необязательно: `init(f)`, `afterRise`, `onHurtHero(f)`, `onDamaged(f, dmg, o)`, `damageMul(f, o)`, `drawFx(f)`. Примеры: `stalker`, `warden`, `drifter`.

---

## Персонажи — `defineCharacter`
`name, desc, perk, art (@hero), stats ({ hp, speed, jump, swim, melee, ranged, wisp, magnet, soul, regen }), start (оружие в руках), lantern ({ x, y, col, halo } — светящийся пиксель кадра), onRun()`.

## Реликвии — `defineRelic`
`name, desc, icon (@icon), rar, stats, biomes, onPickup(), onTick(dt)`. Множители: `speed jump swim melee ranged wisp magnet`; сложение: `maxHp` (полусердца), `soul`; `regen` — секунд на полусердце (берётся меньшее). Работать можно и через хуки: `on('hit', (foe, dmg, o) => { if (heldRelics().some((r) => r.id === 'rime_charm')) foe.slow = 1.4; })`.

## NPC — `defineNPC`
`name, art (@hero), ghost (призрак: холодный, сквозной, тает книзу), tint, place ('tower' | 'spawn' | 'ruin' | (world) => { x, z } | null), radius, voice (звук), biomes, onMeet(n), lines` — строки или `(ctx) => строка | null`; `ctx: left, all, wardenDown, night, relics, shrines, event, weapons, kills, hero, biome, plural(n, 'монета', 'монеты', 'монет')`.

## События — `defineEvent`
`name, toast, warn, biomes, chance, duration ([min, max]), cooldown, when(ctx), weather ({ kind, density, wind }), palette (цели рычагов), paletteMix (0.85), ambience, spawnMul (число | { foeId: k }), fadeIn, fadeOut, onStart(), onTick(dt, k), onEnd()`. Одно событие за раз; директор проверяет каждые 20 с. Помощник: `skyBolt(x, z, { dmg, r, col, light, sound })` — молния с неба.

## Погода — `defineWeather`
`color, size, fall (отрицательная — частицы поднимаются), sway, shape (0 хлопья, 1 струи дождя, 2 пепел), alpha, additive, glow, box`. Всё считается в вершинном шейдере одного облака точек.

## Звуки — `defineSound(id, шаги | (k) => шаги)`
`['tone', частота, длит, тип, громк, к_частоте, задержка]`, `['hiss', длит, частота, q, громк, тип, задержка]`, `['sweep', длит, f0, f1, q, громк, тип, задержка]`. Проиграть: `playSound(id | шаги, { k, pitch, jitter, vol })`. Шаги по блокам — звук `step_<вид>`.
