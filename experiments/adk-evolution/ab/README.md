# A/B: AGES (A) против AGES + ADK (B)

Предрегистрация: `RULES.json`, `tasks/T1..T3.json`, `tests/test_T*.py` (не менять после первого прогона).
Задания похожего масштаба: небольшие изменения улучшенной игры (`baselines/improved.html`), проверяются автоматически.
Тесты проверены Claude: исходная игра их не проходит, эталонные решения в `reference/*.patch` проходят.
Эталонные патчи агентам НЕ показывать.

## Что нужно на машине
- Python 3.10–3.12 и venv: `python -m venv venv`; `venv\Scripts\python -m pip install google-adk==2.12.0 playwright`
- `venv\Scripts\python -m playwright install chromium`
- `npm install three@0.160.0` в любой папке; путь к `node_modules/three` передать как `--three-dir` (или переменная THREE_DIR). Игра тянет three.js с CDN, тест подставляет локальную копию, чтобы условия были одинаковыми.
- установленный `opencode`, один бесплатный model id в `RULES.json` (поле `model`), проверенные флаги в `agent_cmd`.

## Запуск (порядок плеч по `RULES.json: task_order`)
```
python ab/run_arm.py --task T1 --arm B --three-dir <...>/node_modules/three
python ab/run_arm.py --task T1 --arm A --three-dir <...>/node_modules/three
... T2, T3
python ab/compare.py
```
Режим A запускает opencode обычным подпроцессом. Режим B запускает ТОТ ЖЕ подпроцесс (тот же argv, окружение, лимит времени) внутри `BaseAgent` google-adk, запущенного через `InMemoryRunner`. Результаты в `results/<task>-<arm>.json`, вердикт в `results/VERDICT.md` считает `compare.py`.

## Правила
Без повторов из-за нежелательного результата; повтор допустим только если процесс агента не стартовал (`agent_returncode` null). Платные API нельзя. Токены UNKNOWN, если их не видно.
