# WORK IN PROGRESS — ai/claude/three-worlds-design

> Updated 2026-10-18. Mandatory Desktop AI task context.

## Task
Дизайн-документ: объединение трёх миров («Остров сумерек», «Пепельный путь», «Затонувший город») в одну игру. Только документация, без изменения кода и игр.

## Why
Владелец утвердил идею и просил собрать все решения в один md-файл в репозитории, чтобы любой ИИ мог его читать и по нему строить игру этапами.

## Current state
В `docs/` нет единого описания объединения миров. Решения существовали только в чате владельца с Claude.

## Target state
Один файл `docs/OSTROV_THREE_WORLDS_MERGE_RU.md` с сюжетом, бесконечным рельефом, переходами, существами-гостями, генератором реплик, оружием, батискафом, привязкой к движку Острова и этапами.

## Files / systems involved
- `docs/OSTROV_THREE_WORLDS_MERGE_RU.md` (новый)
- `work-notes/ai/claude/three-worlds-design.md` (эта заметка)

## Known risks
- Только документация: код, игры и деплой не затрагиваются; `docs/` и `work-notes/` пропускаются Vercel ignore-проверкой.
- Риск неточных утверждений о коде артефактов: помечено в документе как «не проверено, уточнять по коду».

## Golden systems that must be preserved
- Controls, Collisions, Mobile support, Compact UI/HUD, Release certification, Protected errors, Golden assets/components: не затрагиваются (изменения только в документации).

## Errors that must not return
- Не применимо: реестр ошибок не затрагивается.

## Exact patch / change plan
1. Прочитать `AGENTS.md`, `games/ostrov-sumerek/docs/ENGINE.md` и `ROADMAP.md`.
2. Добавить один md-файл в `docs/`.
3. Проверить `check-agent-rules` и `desktop-ai:check`.
4. PR в `master`, запрос ревью ИИ другой компании (§22).

## Tests to run
- `node scripts/check-agent-rules.js`
- `npm run desktop-ai:check`

## Deployment / PR plan
Task branch -> PR -> ревью ChatGPT (другая компания, §22) -> слияние. Деплой не требуется (только документация).

## Current progress
90%: документ написан, проверки и PR впереди.

## Next action
Запустить проверки, закоммитить, запушить, открыть PR, оставить запрос ревью.

## Completion criteria
- Файл в PR, проверки зелёные.
- Ревью ИИ другой компании пройдено, PR влит в master.

## Final evidence
Not completed.
