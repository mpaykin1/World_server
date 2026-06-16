# Survival — фичи (не ломать!)

## Управление
| Действие | Клавиша |
|----------|---------|
| Движение | WASD |
| Бег | Shift |
| Добыча | ЛКМ |
| Инвентарь | I / E |
| Стройка | B |
| Поворот фундамента | R |
| Слоты хотбара | 1–9 |
| Чат | Enter |

## Инвентарь
- `self.inventory` — массив 36 слотов (0–26 основной, 27–35 хотбар)
- `self.selected` — выбранный слот хотбара (0–8)
- Клик по предмету в инвентаре (0–26) → перемещает в первый пустой слот хотбара. Если хотбар полон → swap с выбранным
- Реализация: `socket.emit('inventory:move', {from, to})` → сервер `server.js:408` шлёт `inventory:update`

### Иконки предметов (canvas 24×24)
- `_itemIcon._d` — рисовалки для: wood (прожилки), stone (крапинки), metal_ore (шестиугольник + ржавчина), cloth (плетение), food (мясо), campfire (пламя), storage_box (ящик), door (дверь)
- Топор 🪓 и кирка ⛏️ — эмодзи

### Текстуры мировых объектов (canvas → THREE.CanvasTexture)
- `_texCache` — кэш по типу: makeWoodTex, makeLeafTex, makeStoneTex, makeOreTex (с ржавыми пятнами и блёстками), makeBushTex
- Wood: RepeatWrapping (2,2) на CylinderGeometry

## Ресурсы (добыча)
- Сервер: проверка `survivalPlayers.get(client.id)`, дистанция < 8м, кулдаун 550мс, добавление в инвентарь
- Клиент: `hitResource()` → `nearestResource()` (raycast по interactables, fallback по дистанции)
- После добычи: `inventory:update` + `resource:update`

## Стройка
- Сервер: кулдаун 350мс, проверка ресурсов (`BUILD_COSTS`), коллизия (`canPlaceBuilding`)
- Типы: foundation, wall, doorway, door, stairs, campfire, storage_box
- Крафт: stone_hatchet, pickaxe, campfire, storage_box, door
- После постройки: `inventory:update` + `building:placed`

## Чанки
- `chunk:request` → `chunk:data` (ресурсы + трава)
- Радиус 2 чанка, кулдаун 850мс, однократная загрузка

## Защита
- `!e.target.closest('button')` — клик по UI кнопкам не вызывает добычу

---

# World-Sharabass — фичи (не ломать!)

## Музыка (Web Audio API)
- **Инициализация**: по первому keydown/mousedown/touchstart (iOS/PC)
- **Аккорды**: 12 типов (C → Dmin7), 4 осциллятора + реверберация
- **Мелодия**: секвенсор с темпом от скорости тапа, случайные ноты
- **Бас**: корень/квинта через filter, синхронизация с битом
- **Build Boost**: при установке объекта `buildBoost` увеличивает `bassLevel`, `harmonyComplexity`, `melodyActivity` на ~2с
- **Звук установки**: C5-E5-G5 мажорный аккорд (`playPlacementSound`)
- **Звук молнии**: шум с полосовым фильтром (cloud/branching)
- **Погода**: от Y касания (облака, дождь, молнии, снег, дым)

## Графика (SDF Raymarching, WebGL2)
- **Сцена**: деформация (скрутка + волны + пульсация), blob, pillar, orb, torus, ground + smooth merge
- **Освещение**: ambient + diffuse + specular + Fresnel + glow, тепло/холод
- **Player-объекты**: металлические (dark steel 0.18/0.20/0.22, spec 64, Fresnel)
- **Погода**: небо с облаками, молниями, дождём, снегом, дымом
- **Камера**: орбитальная вокруг центра, SDF + THREE.js синхронизация

## Управление (PC)
| Действие | Клавиша |
|----------|---------|
| Ходьба | WASD / стрелки |
| Поворот | мышь drag |
| Вид 1-е лицо | Q (переключение) |
| Стройка | B |
| Установка объекта | Space / Enter / клик |
| Размер (стройка) | Q (умньш) / E (увел) |
| Тип объекта | кнопка 🔵 Шар / 🧊 Куб |
| Удалить последний | 🗑️ |
| Музыка | любая клавиша / клик |

## Стройка (Building Mode)
- **Сетка**: snap `Math.round(v/2)*2` (ячейки 2×2)
- **Призрак**: полупрозрачный box/sphere на 2м перед персонажем, по сетке
- **Выход**: авто-выход после установки (`buildBtn.click()`)
- **Размер**: Q/E без ограничений (серверный cap удалён)
- **Типы**: шар (0) / куб (1)

## Сетевые события (WebSocket)
| Событие | Направление | Описание |
|---------|-------------|----------|
| `sharabass:join` | client → server | Регистрация в мире (без этого всё молча дропается!) |
| `sharabass:fly` | client → server | Позиция камеры (троттлинг 50мс) |
| `sharabass:place` | client → server | Установка объекта |
| `sharabass:remove` | client → server | Удаление своего объекта |
| `sharabass:weather` | client ↔ server | Погода |
| `sharabass:init` | server → client | Инициализация (selfId, objects, weather, players) |
| `sharabass:object:placed` | server → broadcast | Новый объект |
| `sharabass:object:removed` | server → broadcast | Объект удалён |
| `sharabass:weather` | server → broadcast | Синхронизация погоды |
| `sharabass:players` | server → broadcast | Список игроков |

## Компактный UI
- **scale(.6)** + **opacity(.7)** для: чата, логина, панели кнопок
- × кнопки: toggle display (без localStorage, при перезагрузке всё видно)
- `apps/world-sharabass/index.html`: `makeCompact()` — применяется через `setTimeout(200ms)`

## Камера (третье лицо / первое лицо)
- **Третье лицо**: `camDistance=6.0`, `camHeight=4.0`, камера сзади-сверху
- **Первое лицо**: Q → `camDistance=0.15`, `camHeight=1.6`, `selfFig.visible=false`
- THREE.js камера синхронизирована с SDF камерой

## Персонаж (THREE.js)
- Модель из каталога: капсула + голова с лицом (canvas) + коробки руки/ноги
- Анимация ходьбы: качание рук/ног через `u.moveTime`
- Диск под ногами: полупрозрачный синий CircleGeometry
- Сетка пола: GridHelper(60, 30) на y=-1.49
- Remote игроки: такие же stick figures, обновляются из `sharabass:players`

## Аудио: важные детали
- `triggerMelodySequencer(x, y)` — вызывается на keydown И mousedown (не только touch)
- Для PC: keydown → `triggerMelodySequencer(random, random)`, mousedown → по координатам
- initAudio ленивый: только по первому взаимодействию (чтобы не блокировался автоплей)

---

# Каталог (Catalog) — фичи (не ломать!)
- **Порталы**: 3D сцена с порталами в другие приложения
- **Движение**: WASD + Shift бег, мышь поворот
- **Мини-карта**: список порталов справа внизу
- **shared/style.css**: панель с блюром `blur(4px)`

---

# Сервер (server.js) — фичи (не ломать!)
- WebSocket на едином `/ws` порту, MiniSocket с очередью
- Аутентификация: регистрация/логин/JWT token
- **Survival**: игроки, ресурсы (чанки), стройка, крафт, инвентарь, автогенерация чанков
- **Sharabass**: игроки, объекты (с металлом), погода, `MAX_SHARABASS_OBJECTS=200`
- **Чат**: глобальный, с историей
- **Сохранение мира**: `saveWorldSoon()` в `data/survival_world.json`
