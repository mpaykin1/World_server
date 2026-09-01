# Как пользоваться Collective Brain

**Обычно просто открой OpenHuman.**

1. Включи компьютер — `agentmemory` поднимется сам (Scheduled Task `WorldServer-AgentMemory`).
2. Открой `OpenHuman` (двойной клик по ярлыку на рабочем столе или `C:\Program Files\OpenHuman\OpenHuman.exe`).
3. Общайся с ИИ — общая память работает автоматически через `http://127.0.0.1:3111` (локально, не в облаке).
4. `World_server` и подключённые `Claude/Codex/OpenCode` могут использовать подтверждённые прошлые решения via `collective-brain:recall`.

**Если что-то не работает:**

- Запусти `CHECK_COLLECTIVE_BRAIN.cmd` на рабочем столе — покажет `RUNNING/DOWN`, `CONNECTED/MISCONFIGURED`, `PASS/FAIL`.
- Если `CHECK` показывает `NEEDS REPAIR` — запусти `REPAIR_COLLECTIVE_BRAIN.cmd` (не удаляет память, не трогает репозиторий).
- Если `REPAIR` не помогает — запусти `START_COLLECTIVE_BRAIN.cmd`.

**Если OpenHuman в обычном чате говорит, что ничего не знает про World_server:**

- Это отдельная, более узкая проблема, чем просто "agentmemory работает" — `CHECK` проверяет только связь, а не содержимое. `CHECK_COLLECTIVE_BRAIN.cmd` теперь дополнительно печатает строку `World_server knowledge: PRESENT/MISSING/STALE`.
- Если там `MISSING` или `STALE` — запусти `npm run collective-brain:knowledge-pack` в папке `World_server` (или попроси ИИ-агента это сделать). Это безопасная, неразрушающая операция: она пишет структурированные факты о проекте в ту же общую память, не трогает код и не требует перезапуска.
- После этого закрой и заново открой OpenHuman, начни новый чат и спроси ещё раз.
- Строка `OpenHuman ordinary chat shared memory: PASS/NOT_VERIFIED/STALE_EVIDENCE` — это отдельный, более строгий статус: `PASS` означает, что кто-то реально прошёл ручной тест в самом окне чата OpenHuman (не просто через REST-запрос) и записал это в `OPENHUMAN_ORDINARY_CHAT_MANUAL_EVIDENCE.json`. `NOT_VERIFIED` — это честно, а не ошибка: значит, такой ручной проверки в чате ещё не было.

**Чтобы OpenHuman читал живые файлы World_server напрямую (не через GitHub):**

- Обычный ярлык `OpenHuman.lnk` не трогается и продолжает работать как раньше.
- Для прямого доступа к `C:\Users\user\Desktop\World_server` используй новый ярлык **"OpenHuman World_server"** на рабочем столе (или `OPENHUMAN_WORLD_SERVER.cmd`) — он на этот один запуск задаёт `OPENHUMAN_ACTION_DIR`, ничего не меняя в системе навсегда.
- Проверка: `CHECK_COLLECTIVE_BRAIN.cmd` теперь также печатает `Local World_server access: CONFIGURED/NOT_CONFIGURED (UI verified: ...)`. `CONFIGURED` значит, что ярлык настроен правильно — но НЕ значит, что OpenHuman уже реально прочитал файлы через чат. Для этого нужен настоящий тест:
  1. Закрой OpenHuman (если он не занят важной задачей).
  2. Запусти **"OpenHuman World_server"**.
  3. Новый чат → спроси: *"Найди файл OPENHUMAN_LOCAL_ACCESS_PROBE.txt в своей рабочей области и скажи точное значение WORLD_SERVER_LOCAL_ACCESS_PROBE."*
  4. PASS только если пришло правильное значение — GitHub тут использоваться не должен.
- ⚠️ Известный открытый вопрос: в `C:\Users\user\Desktop\World_server` есть реальный `.env.local` с настоящими секретами (Supabase и т.д.). Штатная политика OpenHuman (`file_read` в auto-approve, `forbidden_paths` — только директории, не паттерны имён файлов) пока не гарантированно блокирует чтение таких файлов при прямом доступе к папке. До отдельной проверки не проси OpenHuman читать/пересказывать `.env*`/`*.pem`/`*.key`.

**Что где хранится:**

- Локально: `agentmemory` (`~/.agentmemory/`, `~/.agentmemory/.env` с `EMBEDDING_PROVIDER=local`), `OpenHuman` (`%APPDATA%\OpenHuman\config.toml` с `backend="agentmemory"`), общая память — на этом компьютере.
- Облако: только если ты сам включишь внешний LLM (Anthropic/Gemini) в `~/.agentmemory/.env` — тогда запросы уходят в облако, но память остаётся локальной. `Privacy Mode` в OpenHuman → `Local AI` — полностью локально (требует `Ollama` + `bge-m3`, устанавливается отдельно).

**Не нужно каждый день запускать PowerShell.** Достаточно `OpenHuman` и, при проблеме, один клик `CHECK`/`REPAIR`.

**Следующие улучшения (optional, не сейчас):** `Ollama` + `bge-m3` (1024) для локальной инференции, `Gitleaks`/`Trivy`/`OPA` для сканов.
