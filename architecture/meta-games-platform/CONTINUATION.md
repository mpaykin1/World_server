# META GAMES — продолжение

Прочитать актуальные STATE.json, NEXT_TASK.md, ASSET_INDEX.json, MCP_TOOLS.json; проверить GitHub HEAD и CI.

Каталог исходников: PR #563 уже слит в master, merge SHA `3a371abb08c5435d13ca4ec928da306f366afa7f`, индекс 4 игр + 6 кандидатов с неизвестными правами. Повторное использование этих кандидатов запрещено до подтверждения лицензий.

MCP: PR #564 (`ai/chatgpt/meta-games-mcp-20261103`) поверх master, read-only `2026-07-28`, два инструмента (`list_games`, `inspect_game`) на HTTP `/mcp`, `/health`. Перед merge подтвердить `node --test architecture/meta-games-platform/mcp/worker.test.mjs` и обязательные CI на точном HEAD; статус deploy пока **нет**. Не считать пустые DEPLOYMENTS.json и working_tools опубликованной системой.

Cloudflare PR-preview показал ошибку `10037`: достигнут лимит бесплатных Workers. Не удалять и не заменять работающие Workers без проверки. Следующая задача только из NEXT_TASK.md, при необходимости рассмотреть бесплатный альтернативный хостинг. Никаких платных услуг, шестой автозадачи, подмены семи движков или правок принятых игр.
