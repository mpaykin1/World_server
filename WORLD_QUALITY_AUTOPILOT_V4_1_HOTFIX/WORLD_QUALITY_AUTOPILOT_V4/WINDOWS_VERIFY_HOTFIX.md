# Windows verify hotfix — V4.1

## Исправлено
Предыдущий V4 мог падать на Windows/Node на полном verify с ошибкой:

`spawnSync npm.cmd EINVAL`

Причина: `execFileSync/spawnSync` не на всех Windows/Node сборках корректно запускает `npm.cmd` напрямую.

V4.1 больше не запускает `npm.cmd` напрямую. На Windows installer вызывает:

`cmd.exe /d /s /c "npm run release:gate"`

На macOS/Linux поведение не изменено.

## Восстановление после неудачной V4 установки
Если предыдущий запуск откатил payload и оставил только изменённый `WORK_IN_PROGRESS.md`:

1. Оставаться в ветке `ai/desktop/world-quality-autopilot-v4`.
2. Проверить `git status` и убедиться, что нет чужих незакоммиченных изменений.
3. Если изменён только WIP от неудачной V4 установки, можно выполнить `git restore WORK_IN_PROGRESS.md` — новый installer снова обновит его.
4. Держать этот ZIP/распакованную папку **вне `World_server`**, чтобы rollback/cleanup проекта не удалил установочный пакет.
5. Запустить installer V4.1 с `--repo` и `--verify-full`.

## Команда
```powershell
cd C:\Users\user\Desktop\WQA_V4_1_WINDOWS_HOTFIX\WORLD_QUALITY_AUTOPILOT_V4
node .\install-world-quality-autopilot.cjs --repo "C:\Users\user\Desktop\World_server" --verify-full
```

Если в репозитории есть осознанные незакоммиченные изменения, сначала сохранить/закоммитить их. `--allow-dirty` использовать только после проверки Desktop AI, что эти изменения относятся к текущей задаче.
