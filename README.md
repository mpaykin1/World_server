# World Server

Единый проект браузерных WebGL-приложений: 3D-каталог, глобальный чат, survival, World-Sharabass и Voxel World. Графика, управление и игровые механики сохранены; постоянные данные и realtime перенесены на Supabase, а HTTP API подготовлен для stateless-функций Vercel.

## Приложения

```text
apps/
  catalog/
  chat/
  survival/
  voxel-world/
  world-sharabass/
shared/
```

`/api/apps` анализирует поставляемую вместе с приложением папку `apps/`. Новая папка с `index.html` автоматически появляется порталом в каталоге. Название берётся из `<title>`, а при его отсутствии — из имени папки.

## Локальный запуск

Требуется Node.js 24.

```powershell
npm install
Copy-Item .env.example .env.local
npm start
```

В `.env.local` используются значения из Supabase/Vercel:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Поддерживаются также прежние имена `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` и `SUPABASE_SERVICE_ROLE_KEY`. Секретный ключ используется только серверными функциями и никогда не отдаётся клиенту.

Открыть: `http://localhost:3000`.

## Развёртывание

- Vercel отдаёт статические файлы из `apps` и `shared`, а файлы `api/*.js` запускает как независимые stateless-функции.
- Supabase Auth хранит пользователей и сессии.
- Postgres хранит профили, игроков, инвентарь, мир, чат, ресурсы, постройки, объекты и изменения voxel-блоков.
- Supabase Realtime Postgres Changes доставляет изменения постоянного мира и чата.
- Supabase Realtime Broadcast используется для частых координат игроков, Presence — для входа и выхода из мира.
- Серверные RPC выполняют атомарную проверку ресурсов, cooldown, крафт и строительство.

Схема находится в `supabase/migrations`. Для новой среды миграции применяются Supabase CLI или через подключённую интеграцию Supabase.

## Совместимость

Сохранены существующие маршруты `/api/apps`, `/api/register`, `/api/login`, `/api/me`, `/api/logout` и прежний интерфейс `MiniSocket`. Для Voxel World добавлен маршрут `/api/voxel`. Игровые клиенты продолжают отправлять события `chat:*`, `survival:*` и `sharabass:*`; `shared/common.js` прозрачно переводит их в stateless API и Supabase Realtime.

Локальные файлы в `data/` оставлены в репозитории для истории, но приложение их не читает и не использует для постоянных данных.

## Проверки

```powershell
npm run check
```

Команда проверяет синтаксис серверного и клиентского JavaScript и запускает тесты правил авторизации, инвентаря, генерации чанков и строительства.

## Управление в Voxel World

- `WASD` — движение;
- мышь — обзор;
- `Space` — прыжок;
- `Shift` — бег;
- `ЛКМ` — сломать блок;
- `ПКМ` — поставить блок;
- `1–9` — выбрать блок;
- `Enter` — глобальный чат.

Архитектура мира, мобильное управление и модель данных описаны в [`docs/VOXEL_WORLD.md`](docs/VOXEL_WORLD.md).

## Управление в каталоге

- `WASD` — движение;
- `Shift` — бег;
- мышь — камера;
- подойти к порталу — перейти в приложение;
- `Enter` в поле чата — глобальный чат.

## Управление в survival

- `WASD` — движение;
- `Shift` — бег;
- мышь — камера;
- `ЛКМ` — добыча;
- `B` — режим строительства;
- `R` — повернуть строительный объект;
- `ЛКМ` в режиме стройки — поставить объект;
- `1–9` — слот hotbar;
- `I` или `E` — Inventory;
- кнопки справа снизу — крафт.

Инвентарь содержит 36 слотов, последние 9 являются hotbar. Сервер атомарно проверяет дистанцию, ресурсы, cooldown, коллизии и опору строительных элементов.

## Как добавить приложение

Создайте `apps/new_app/` с файлами `ico.png`, `index.html` и `client.js`. В HTML подключите общий интерфейс и клиент:

```html
<link rel="stylesheet" href="/shared/style.css">
<script src="/shared/common.js"></script>
<script type="module" src="./client.js"></script>
```

В `client.js` инициализируйте приложение:

```js
await window.AppCore.init('new_app');
```
