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

**Что где хранится:**

- Локально: `agentmemory` (`~/.agentmemory/`, `~/.agentmemory/.env` с `EMBEDDING_PROVIDER=local`), `OpenHuman` (`%APPDATA%\OpenHuman\config.toml` с `backend="agentmemory"`), общая память — на этом компьютере.
- Облако: только если ты сам включишь внешний LLM (Anthropic/Gemini) в `~/.agentmemory/.env` — тогда запросы уходят в облако, но память остаётся локальной. `Privacy Mode` в OpenHuman → `Local AI` — полностью локально (требует `Ollama` + `bge-m3`, устанавливается отдельно).

**Не нужно каждый день запускать PowerShell.** Достаточно `OpenHuman` и, при проблеме, один клик `CHECK`/`REPAIR`.

**Следующие улучшения (optional, не сейчас):** `Ollama` + `bge-m3` (1024) для локальной инференции, `Gitleaks`/`Trivy`/`OPA` для сканов.
