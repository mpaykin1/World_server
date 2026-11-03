# Одна следующая техническая задача: аудит прав на шесть игровых компонентов

**Публичный MCP от master проверен**: Render Free `srv-dbktrnh42hec73dasfvg`, https://meta-games-mcp-production.onrender.com/meta-games/mcp , автодеплой по `World_server/master`. GitHub Actions https://github.com/mpaykin1/World_server/actions/runs/41642728650 подтвердил HTTP 200 для GET `/meta-games/health` и POST `server/discover`, `tools/list`, `list_games`, `inspect_game`; 4 игры и портал также HTTP 200. Исходный deploy SHA `138f67308d692e053f4715747f5412a2ceaaac21`. Render Free может засыпать, нет гарантии непрерывной доступности и не проверен failover.

**Следующая единственная задача**: проверить авторство, источники и лицензии шести кандидатов из `ASSET_INDEX.json` в закреплённом `meta6` SHA; документировать подтверждённые разрешения и ограничения, без угадывания лицензий и без доступа к исходникам через MCP, пока права не установлены. После этого реализовать `list_assets` только для юридически разрешённых элементов.

Отдельный неразрешённый Netlify production 404: нет подключённых production deploy settings/logs, не утверждать причину и не удалять чужие сервисы. Cloudflare Free 100/100 Worker (10037); не платить и не освобождать чужие ресурсы. Семь движков и пять автозадач не блокировать.
