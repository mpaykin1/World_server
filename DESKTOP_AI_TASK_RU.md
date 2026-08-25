# Задание Desktop AI — внедрить GAP_CLOSURE_SYSTEM_V1

Работай от `ai/desktop/world-quality-autopilot-v4`. Создай отдельную ветку `ai/desktop/gap-closure-v1`. НИКОГДА не пушь напрямую в `master/main` и не делай auto-merge.

1. Скопируй содержимое этой папки в корень `World_server`.
2. Запусти `node install-gap-closure-v1.cjs C:\Users\user\Desktop\World_server`.
3. Убедись, что миграция `20260824054000_gap_closure_system_v1.sql` присутствует в репозитории. Live Supabase уже содержит эту систему; миграция нужна для синхронизации репозитория и воспроизводимости.
4. Выполни полный цикл из `docs/DESKTOP_AI_GAP_CLOSURE.md`.
5. Сначала закрой `project.mobile.viewport-fit` — установщик/engine умеет безопасно добавить `viewport-fit=cover`, но gap закрывается только после повторного `project:review`.
6. Проверь production regression и `PRODUCTION_QUALITY_REPORT.json`. Найди root cause, исправь, повторяй production gate до PASS.
7. Дождись обработки `pixel.atlas.build`; если worker не умеет этот kind — реализуй handler, тест и manifest writer. Gap закрывается только когда `pixel_animation_atlas_manifests > 0` и verifier PASS.
8. Для SECURITY DEFINER не делай слепой revoke. Для каждой из функций проверь назначение, RLS и вызывающие клиенты; переведи на SECURITY INVOKER или сузь EXECUTE только если контракт сохраняется. После каждого изменения запускай security advisor/SQL verification.
9. Реальные iOS/Android evidence не подменяй эмуляцией. Если физический provider недоступен, статус только `blocked` с точной причиной, но не 100%.
10. Не останавливайся, пока все release blockers и auto-fixable gaps не закрыты свежим evidence. Если исправление не сработало — зафиксируй ошибку, найди root cause, измени стратегию и повтори.

Финальный отчёт обязан содержать: openGapCount, releaseBlockerCount, perfectReadiness, какие gap закрыты, какие заблокированы внешней зависимостью, все тесты и ссылку на PR.
