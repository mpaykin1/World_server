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

- Единственный ярлык на рабочем столе для этого: **"World_server AI"** (папка `C:\Users\user\Desktop\World_server AI\`, launcher `Launchers\WORLD_SERVER_AI.cmd`). Обычный ярлык `OpenHuman.lnk` не трогается и продолжает работать как раньше, отдельно.
- ⚠️ **Главная причина, по которой запуск может "ничего не делать":** OpenHuman — single-instance приложение (pre-CEF mutex). Если OpenHuman уже открыт (даже свёрнут/не на переднем плане), повторный запуск тихо завершается и НЕ применяет `OPENHUMAN_ACTION_DIR` к уже открытому окну — это не баг лаунчера, это штатное поведение single-instance, которое лаунчер теперь обнаруживает и показывает явным сообщением "OpenHuman is ALREADY RUNNING". Решение: закрыть OpenHuman полностью, затем снова запустить "World_server AI".
- Лог последнего запуска: `World_server AI\Logs\OpenHuman-launch-latest.log`.
- Проверка: `CHECK_COLLECTIVE_BRAIN.cmd` печатает четыре независимых статуса — не путать их:
  - `World_server knowledge: PRESENT/MISSING/STALE` — есть ли реальные факты о проекте в памяти.
  - `Local World_server access: CONFIGURED/NOT_CONFIGURED (UI verified: ...)` — настроен ли launcher (не значит, что OpenHuman уже реально читал файлы).
  - `OPENHUMAN_LAUNCH_CHECK ... guiLaunchVerified=...` — `LAUNCHED_OK` (реально открылось окно) отличается от `BLOCKED_SINGLE_INSTANCE` (уже был открыт) и от `FAIL`. Просто "exe существует, exit code 0" никогда не считается PASS.
  - `routing=OPENROUTER_FREE_PRIMARY` — какой провайдер сейчас реально используется для чата.
- Настоящий тест доступа к файлам:
  1. Закрой OpenHuman полностью.
  2. Запусти **"World_server AI"**.
  3. Новый чат → спроси: *"Найди файл OPENHUMAN_LOCAL_ACCESS_PROBE.txt в своей рабочей области и скажи точное значение WORLD_SERVER_LOCAL_ACCESS_PROBE."*
  4. PASS только если пришло правильное значение — GitHub тут использоваться не должен.
- Защита секретов: реальные секретные файлы (`World_server\.env.local`, `WORLD_SERVER_SECRETS\`, приватные ключи в `.world-server-state\`) добавлены в `forbidden_paths` OpenHuman (штатный механизм, не отдельная песочница) — обычное чтение файлов их не откроет. Список не гарантированно полон на 100% для будущих новых секретных файлов — при сомнении не проси OpenHuman читать файл с "secret"/"key"/"token"/"credential" в названии напрямую.

**Что где хранится:**

- Локально: `agentmemory` (`~/.agentmemory/`, `~/.agentmemory/.env` с `EMBEDDING_PROVIDER=local`), `OpenHuman` (`%APPDATA%\OpenHuman\config.toml` с `backend="agentmemory"`), общая память — на этом компьютере.
- Облако: только если ты сам включишь внешний LLM (Anthropic/Gemini) в `~/.agentmemory/.env` — тогда запросы уходят в облако, но память остаётся локальной. `Privacy Mode` в OpenHuman → `Local AI` — полностью локально (требует `Ollama` + `bge-m3`, устанавливается отдельно).

**Не нужно каждый день запускать PowerShell.** Достаточно `OpenHuman` и, при проблеме, один клик `CHECK`/`REPAIR`.

**Следующие улучшения (optional, не сейчас):** `Ollama` + `bge-m3` (1024) для локальной инференции, `Gitleaks`/`Trivy`/`OPA` для сканов.
