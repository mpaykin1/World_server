# META GAMES PLATFORM — продолжение работы

1. Читать этот файл, `STATE.json`, `NEXT_TASK.md`, `ASSET_INDEX.json`. Затем актуальные `World_server/AI_START_HERE.md`, `architecture/automation-config.md`, `architecture/engines/`, `meta6/SOURCE_INDEX.md` и `meta6/AGENTS.md`.
2. Проверить на GitHub реальный HEAD `master` и состояние PR `ai/chatgpt/meta-games-catalog-20261103`; `STATE.json` не является доказательством merge/deploy.
3. Первый функциональный шаг: каталог `catalog.mjs` с настоящими путями + блокировка переиспользования при неподтверждённых правах. Проверка: `node architecture/meta-games-platform/catalog.mjs validate`.
4. Следующий шаг **ровно один** в `NEXT_TASK.md`: реальный read-only MCP. Не выдавать наличие файла сервера за развёртывание.
5. Пять автозадач `:05/:15/:30/:40/:50` сохраняют приоритет семи движков и не правят параллельно `architecture/engines/` ради платформы. Платформенные изменения — отдельный PR. В новых чатах сперва проверить открытые PR платформы, а не создавать дубль.
6. В конце работы обновить только нужные `STATE.json`, `NEXT_TASK.md`, `CONTINUATION.md`, `DEPLOYMENTS.json`, `MCP_TOOLS.json` в рабочем PR; подтверждать статусы точными SHA и публичными URL.
