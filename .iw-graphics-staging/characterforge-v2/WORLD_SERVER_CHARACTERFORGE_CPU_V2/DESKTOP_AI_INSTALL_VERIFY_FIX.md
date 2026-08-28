# Desktop AI — INSTALL → VERIFY → FIX UNTIL PASS

1. Прочитать `00_START_HERE.md` полностью.
2. Работать только в отдельной git-ветке; `master` напрямую не пушить.
3. Запустить `python tests/test_patch_static.py` и `python tests/test_installer_integration.py`.
4. Запустить `install_characterforge_cpu_v2.py` из корня `World_server`.
5. Не создавать новый AI3D worker — расширить существующий.
6. Найти Blender или установить официальный Blender; при необходимости задать `BLENDER_BIN`.
7. Если Python `>=3.11,<3.14`, установить `rembg[cpu]`; иначе оставить optional fallback и не ломать Python worker.
8. Выполнить:
   - `npm run characterforge:check`
   - `npm run characterforge:check:strict`
   - `npm run characterforge:selftest`
9. Self-test обязан создать 3 валидных GLB и подтвердить один `paletteHash` + один `rigSchemaHash` на всех LOD.
10. Выполнить общие regression/quality gates World_server.
11. Выполнить реальный `characterforge_local_smoke.py` на front+side+back, если тестовые изображения доступны.
12. Проверить `characterforge-regression.json = PASS` и `characterforge-godot.zip`.
13. Повторить тот же запрос: второй прогон должен использовать content-addressed cache.
14. Любой FAIL: сохранить лог → найти root cause → исправить → добавить защиту от регрессии → повторить весь затронутый набор тестов.
15. Не останавливаться, пока все доступные обязательные тесты не PASS. Не скрывать внешний блокер.
16. После успеха сохранить отчёт, причины исправленных ошибок и полезные решения в действующей knowledge/regression системе World_server.
