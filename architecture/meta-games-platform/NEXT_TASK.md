# Одна следующая задача

Проверить CI зависимого PR MCP на точном SHA; после слияния базового каталога #563 безопасно развернуть отдельный Worker на бесплатном Cloudflare без изменения существующих Workers, запросить /health, server/discover, tools/list, list_games, inspect_game. Только после успешных HTTPS проверок записать реальный URL в DEPLOYMENTS.json и working_tools в MCP_TOOLS.json. При квотном блокере перейти к бесплатному альтернативному хостингу; не объявлять deploy успешным до проверки.
