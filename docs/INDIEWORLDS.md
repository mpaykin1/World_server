# IndieWorlds в World Server

IndieWorlds — это открытый слой представления существующих миров. Он не заменяет сервер, авторизацию, сохранения или Quality Gate и не переносит игровые рантаймы на Neocities. Каждый опубликованный мир получает собственный переносимый паспорт, RSS-обнаружение и типизированные связи с другими мирами.

## Публичные представления

- `GET /api/worlds?format=indieweb` — индекс опубликованных миров.
- `GET /api/worlds?format=indieweb&id=<world-id>` — JSON-паспорт одного мира с MIME-типом `application/vnd.world-server.indieworld+json`.
- `GET /api/worlds?format=rss` — RSS 2.0.
- `/shared/indieworlds/index.json`, `/shared/indieworlds/feed.xml` и `/shared/indieworlds/worlds/*.json` — детерминированные статические копии для простого хостинга и резервного экспорта.

Обычный ответ `GET /api/worlds` сохранён без изменений. Все новые форматы доступны только через `GET`.

## Граница публикации

Канонический источник — `data/app-release-registry.json` с политикой `deny-by-default`. В публичный индекс попадают только сертифицированные локальные миры и внешние развёртывания с явными `worldMenu.show: true` и `status: legacy-deployment`. Миры в карантине не получают публичный адрес паспорта; связи с ними сохраняют сюжет, но не раскрывают URL. Публичный API не предоставляет обходного inventory-scope.

В production абсолютный origin берётся только из `WORLD_PUBLIC_URL` или `PUBLIC_BASE_URL`; без настройки используется канонический `https://world-server.ai.studio`. Заголовки `Host` и `X-Forwarded-Host` не становятся каноническим origin. В локальной разработке разрешены только loopback-адреса.

Статические файлы обновляются командой:

```bash
npm run indieworlds:export
```

Проверка дрейфа:

```bash
npm run indieworlds:check
```

## Webmention

Паспорта уже описывают совместимые публичные ссылки `source → target`, но намеренно не рекламируют endpoint приёма Webmention. Приёмник можно включать только после появления постоянного хранилища, проверки целевого URL, rate limiting, защиты от SSRF и очереди модерации. До этого состояние фиксируется как `receiver-pending-persistence-and-moderation-gate`.

## Добавление нового мира

1. Добавить мир в канонический release registry и lore bible.
2. Пройти сертификацию и существующий Quality Gate.
3. Запустить `npm run indieworlds:export`.

Golden UI автоматически покажет паспорт опубликованного мира и добавит RSS, JSON-представление и JSON-LD в `<head>`. Черновик увидит только статус ожидания сертификации.

Статический каталог можно разместить на любом обычном файловом хостинге, включая Neocities. Серверная логика, пользовательские данные и Webmention-приёмник должны оставаться на инфраструктуре с контролируемым хранилищем и политиками безопасности.
