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

**Что где хранится:**

- Локально: `agentmemory` (`~/.agentmemory/`, `~/.agentmemory/.env` с `EMBEDDING_PROVIDER=local`), `OpenHuman` (`%APPDATA%\OpenHuman\config.toml` с `backend="agentmemory"`), общая память — на этом компьютере.
- Облако: только если ты сам включишь внешний LLM (Anthropic/Gemini) в `~/.agentmemory/.env` — тогда запросы уходят в облако, но память остаётся локальной. `Privacy Mode` в OpenHuman → `Local AI` — полностью локально (требует `Ollama` + `bge-m3`, устанавливается отдельно).

**Не нужно каждый день запускать PowerShell.** Достаточно `OpenHuman` и, при проблеме, один клик `CHECK`/`REPAIR`.

**Следующие улучшения (optional, не сейчас):** `Ollama` + `bge-m3` (1024) для локальной инференции, `Gitleaks`/`Trivy`/`OPA` для сканов.
