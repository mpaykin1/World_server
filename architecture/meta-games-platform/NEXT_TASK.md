# Следующая техническая задача — подтвердить автоматический deploy по push и Netlify production

На 04.11.2026 защищённый GitHub secret Render Deploy Hook уже настроен. Ручной GitHub Actions run https://github.com/mpaykin1/World_server/actions/runs/41783165073 завершён SUCCESS: авторизация, деплой точного master SHA `a3f8b3285f1097b0c7d52c90292a91965b896626`, публичный health, 5 MCP RPC, 4 игры.

**Текущий функциональный PR:** `ai/chatgpt/meta-games-licensed-search-20261104` — инструмент MCP `search_assets`, который поиском показывает исключительно объекты с подтверждёнными правами; на текущем каталоге ответ пуст. Независимые тесты должны пройти до merge.

**Приоритет после merge:** доказать, что `push master` автоматически инициирует workflow `.github/workflows/meta-games-render-cd.yml`, Render обслуживает новый точный SHA, и `search_assets` отвечает по публичному MCP. НЕ приравнивать ручной запуск к push-trigger.

После этого отдельно устранить Netlify production 404 на `https://world-server.netlify.app/meta-games/health`. Установить production branch / последнюю публикацию / функцию и маршрут; без доступных логов причину не утверждать. Netlify preview не считается production. Cloudflare Free worker quota 100/100; не удалять чужие скрипты и не покупать тарифы.

Оставить шесть кандидатов на ассеты недоступными для распространения до подтверждения прав; семь движков и игры не менять в данном PR.
