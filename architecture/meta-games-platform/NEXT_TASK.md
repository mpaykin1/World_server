# Единственная следующая техническая задача — автоматическое развёртывание Render MCP

PR #568 слит в master: `166f6091783af0bb7b4072bb23a6dcdd418b3586`. Шесть компонентов юридически не подтверждены, поэтому остаются недоступными для свободной выдачи. В текущей ветке реализован `list_assets` в едином MCP; до merge, Render deploy и реального HTTPS smoke **не считать инструмент опубликованным**.

**Следующая задача после публикации этого PR:** подключить GitHub→Render через существующий Git-провайдер либо настроить GitHub Actions с безопасно сохранённым Render Deploy Hook/API token. После merge master автоматически инициируется deploy, затем проверяется точный SHA и все публичные GET/POST. Отсутствие авторизованного hook/secret — честный BLOCKED, не имитировать автодеплой.

Постоянный Render: https://meta-games-mcp-production.onrender.com/meta-games/mcp . Последний подтверждённый Render SHA `5f3cf584124bab7b762c5417841c5e36cf8a42f4`, deploy `dep-dbku65ek1f9s73e0rha0`; после merge #568 уже отстаёт от master. Render Free может засыпать.

Netlify production /meta-games/health ранее возвращал HTTP 404; без доступа к параметрам production причина не подтверждена. Cloudflare Workers Free 100/100 (10037), не удалять другие Worker. Семь движков, игры и пять автозадач не изменять.
