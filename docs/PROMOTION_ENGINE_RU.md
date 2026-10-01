# World Server Promotion Engine

Система повторяет полезную механику показанного пользователем outreach-пайплайна, но делает её проверяемой:

1. Research your site — только факты с публичным URL-источником.
2. Explore competitors — наблюдаемый факт хранится отдельно от нашего вывода.
3. Define campaigns — отдельные кампании для команд, образования, НКО, креативных агентств и частных участников.
4. Potential organizations — fit score по географии, сектору, need signals и качеству evidence.
5. Decision-maker roles — сначала выбирается роль в организации, без скрейпинга частных данных.
6. RU/EN drafts — deterministic draft всегда доступен; Workers AI может только улучшить формулировку на основе переданных фактов.
7. Landing + UTM — измеримая ссылка под кампанию.
8. Feedback loop — draft → reviewed → sent → replied → meeting → won/lost; opt-out прекращает контакт.

## Защита качества

- Auto-send отсутствует.
- Персонализация считается доказательной только при publicFact + sourceUrl.
- B2B-кампании помечены proposal, пока владелец не подтвердит продукт.
- Нельзя выдумывать клиентов, бюджеты, связи, численность, личные email или скрытые данные.
- Agent Zero bridge генерирует research brief и принимает обратно только строки с HTTPS source_url и observed_fact.

## Файлы

- tools/promotion-engine/ — интерфейс.
- lib/promotion-engine.mjs — scoring, roles, bilingual drafts и evidence import.
- promotion-api.mjs — Cloudflare API.
- data/promotion-theater.json — профиль театрального сайта и кампаний.
- test/promotion-engine.test.js — unit tests.
- test/promotion-tool-files.test.js — static integration guards.

## API

GET /api/promotion возвращает profile и capabilities.
POST /api/promotion с operation=score считает fit.
POST /api/promotion с operation=draft генерирует RU/EN draft; ai=true включает Workers AI, но результат остаётся human-review-only.
