# Survival — фичи (не ломать!)

## World-Sharabass (миршарабас)
- **Вид от 1-го лица**: Q (не в стройке) → `firstPerson = !firstPerson`, `camDistance = 0.15`, `camHeight = 1.6`, `selfFig.visible = false`
- **Закрытие UI**: × на чате, логине, панели кнопок. Состояние хранится в `localStorage` (`closed_auth`, `closed_chat`).

## Компактный UI
Реализовано в `apps/world-sharabass/index.html` (только для миршарабаса):
- **Чат** (`.mc-chat`): `transform:scale(.6)`, `transform-origin:bottom left`, `opacity:.7`, кнопка ×
- **Логин** (`#authBox`): `transform:scale(.6)`, `transform-origin:top right`, `opacity:.7`, кнопка ×
- **Панель кнопок** (`#ui`): `transform:scale(.6)`, `opacity:.7`, кнопка ×
- × кнопки toggle display (без localStorage) — при перезагрузке всё видно
- `shared/common.js` — НЕ трогать! Чат и логин создаются там, компакт применяется только в world-sharabass

## Управление
| Действие | Клавиша |
|----------|---------|
| Добыча | ЛКМ |
| Инвентарь | I / E |
| Стройка | B |
| Поворот фундамента | R |
| Слоты хотбара | 1–9 |

## Инвентарь
- `self.inventory` — массив 36 слотов
  - 0–26: основной инвентарь
  - 27–35: хотбар
- `self.selected` — выбранный слот хотбара (0–8, соответствует 27–35)

### Перемещение предметов
- Клик по предмету в инвентаре (0–26) → перемещает в первый пустой слот хотбара
- Если хотбар полон → меняется местами с выбранным слотом
- Реализация: `socket.emit('inventory:move', {from, to})` → сервер шлёт `inventory:update`
- **Ломать нельзя**: сервер `server.js:408` ждёт `{from, to}` и шлёт обновлённый инвентарь

### Текстуры предметов (иконки)
- Генерируются через Canvas 24×24 → data URL → `<img src="...">` в `innerHTML` слота
- Функция: `_itemIcon(key)` + `_itemIcon._d` (рисовалки)
- Кэширования нет — каждая иконка генерируется один раз при загрузке страницы
- **Ломать нельзя**: `ITEM_ICON` используется в `makeInvSlot()` для отрисовки
- **Топор и кирка** — эмодзи 🪓⛏️ (не canvas, вернули по просьбе)

### Текстуры мировых объектов
- Генерируются через Canvas → `THREE.CanvasTexture` с кэшем (`_texCache`)
- Функции: `makeWoodTex()`, `makeLeafTex()`, `makeStoneTex()`, `makeOreTex()`, `makeBushTex()`
- Wood: RepeatWrapping (2,2) на `CylinderGeometry`
- **Ломать нельзя**: `createResourceMesh()` применяет текстуры через `texMat(getTex(...))`

## Ресурсы (добыча)
- Сервер проверяет `survivalPlayers.get(client.id)`, дистанцию, кулдаун 550мс
- Клиент: `hitResource()` → `nearestResource()` (raycast + fallback по дистанции <8м)
- После добычи сервер шлёт `inventory:update` и `resource:update`

## Стройка
- Сервер проверяет кулдаун 350мс, ресурсы (`BUILD_COSTS`), коллизию (`canPlaceBuilding`)
- После постройки сервер шлёт `inventory:update` и `building:placed`

## Чанки
- `chunk:request` → `chunk:data` (ресурсы + трава)
- Радиус 2 чанка, кулдаун 850мс
- Только один раз: `if(chunks.has(key)) continue;`

## Подсказка в коде
- При клике на UI кнопки: `!e.target.closest('button')` — игнорировать (защита от случайной добычи при клике на кнопку)
