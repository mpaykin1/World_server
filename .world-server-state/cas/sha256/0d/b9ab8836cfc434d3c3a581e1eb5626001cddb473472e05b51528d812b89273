# QUALITY AUTOPILOT v11 CPU-FIRST — START HERE

Цель: установить CPU-first усиление поверх текущего `World_server`, НЕ заменяя более новые системы репозитория и НЕ рискуя `master`.

## Главное правило
**На сервере GPU нет и не ожидается. Серверный GPU НЕ является обязательным gate.** Если существует проверенный CPU-путь, отсутствие GPU не должно блокировать релиз. Нельзя выдавать CPU-фотограмметрию/mesh fallback за настоящий 3DGS training.

## Одна команда Windows
```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_QUALITY_AUTOPILOT.ps1 -RepoPath "C:\Users\user\Desktop\World_server"
```

Установщик обязан:
1. создать отдельную `opencode/quality-autopilot-v11-cpu-*` ветку и sibling worktree;
2. сначала сохранить текущие более новые системы `World_server` как source of truth;
3. добавить v10 safety prerequisite и v11 CPU-first overlay;
4. выставить `serverAcceleration.gpuRequired=false` и дневной server GPU budget `0`;
5. выполнить v11 tests, CPU benchmark, parallel CPU scan, SBOM, migration safety и текущий `release:gate`;
6. не писать напрямую в `master` и не деплоить production до PASS.

## Не останавливаться на ошибке
После любой воспроизводимой ошибки в изменённой области: определить root cause → исправить → добавить/усилить regression test → повторить проверки. **Не останавливаться, пока все локально исправимые ошибки не устранены.** Остановка допустима только при внешнем блокере, который невозможно устранить кодом в этом worktree (например, нет Vercel project binding или внешнего runner). Такой случай записать как `HOLD`, не как `PASS`.

## CPU-first обязательные проверки
```powershell
npm run quality:v11:test
npm run quality:v11:cpu:benchmark
npm run quality:v11:cpu:parallel-scan
npm run quality:v11:cpu:policy
npm run quality:v10:sbom
npm run quality:v10:migrations
npm run release:gate
npm run quality:v11:readiness
```

## Нельзя ухудшать ради CPU
Нельзя снижать near-player texture/mesh/shadow/pixel quality, ломать movement/camera/jump/spawn/collision/touch. При нагрузке сначала снижать частоту дальнего AI/physics, batching и background work; использовать LOD/fog/occlusion только вдали.

Полная процедура: `DESKTOP_AI_APPLY.md`.
