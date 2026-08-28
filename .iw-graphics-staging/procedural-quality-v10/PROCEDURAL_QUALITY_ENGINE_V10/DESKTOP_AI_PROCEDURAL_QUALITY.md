# DESKTOP AI — Procedural Quality Engine V10.0

## Главное правило
НЕ ОСТАНАВЛИВАТЬСЯ после первой найденной ошибки. Продолжать поиск, исправление и полный повтор тестов, пока не исправлены ВСЕ воспроизводимые ошибки, регрессии, предупреждения и нарушения качества, которые можно устранить из репозитория.

Остановиться разрешено только если все проверки PASS либо оставшийся блокер объективно внешний (например, нет физического iPhone для реального device evidence). Внешний блокер нужно записать точно и продолжить исправлять всё остальное. Запрещено ослаблять, удалять, пропускать или переписывать gate ради зелёного статуса.

## Установка
Запусти `INSTALL_TO_WORLD_SERVER.bat`. Он создаёт отдельный `%TEMP%\World_server_pqv10` и ветку `opencode/procedural-quality-v10`. Master не трогать до полного PASS.

## Что V10 добавляет
- Temporal Artifact Detector: ghosting / flicker / shimmer.
- Frame Pacing Governor: p50/p95/p99, jank, stutter, long tasks.
- Resource Watchdog: рост heap/canvas/resources и утечки.
- Thermal/Mobile Governor: hidden/save-data/low-battery/main-thread pressure.
- Shader Prewarm: compileAsync/compile и бюджетный прогрев.
- Deterministic Replay Benchmark для воспроизводимых regression-сценариев.
- Preview/Production Canary gate.
- Runtime Health + Canary evidence в Supabase.

## Обязательный цикл
1. `npm run procedural:models:verify`
2. `npm run procedural:three-patch`
3. `npm run procedural:inject`
4. `npm run procedural:doctor`
5. `npm run procedural:native-audit`
6. `npm run procedural:check`
7. `npm run release:gate`
8. `npm run procedural:evidence`
9. Исправить ВСЕ обнаруженные ошибки.
10. Повторить весь цикл с шага 1.

## Проверка графики
Проверить depth/normal/object-ID/motion/reactive/transparency, TSR без шлейфов, GI, PBR, отсутствие мерцания/ghosting/shimmer, сохранение исходной темноты/палитры/кадра. `?pq=off` обязан возвращать исходную рабочую графику без V10.

## Проверка анимации
Стопы не скользят; направление ног соответствует движению; оружие не отрывается от рук; длинное оружие держится двумя руками; щит остаётся вертикально между торсом и противником; custom deformation либо имеет exact velocity provider, либо reactive fallback. Никаких temporal-шлейфов конечностей.

## Проверка оптимизации
Следить за p95/p99, jank/stutter, long tasks, памятью, количеством canvas/resources, shader warmup failures. При нагрузке качество понижать постепенно через pass budget/thermal governor, а не выключать важные системы случайно.

## Preview
`VERIFY_AFTER_INSTALL.bat https://PREVIEW.vercel.app`
Затем открыть `/apps/procedural-quality-certification/` на реальных iPhone/iPad, Android, iGPU и dGPU примерно на 10 секунд каждый.

## Golden baseline
Снять baseline после Preview и визуально проверить его. Нельзя автоматически утвердить плохой baseline.

## Canary
`npm run procedural:canary` должен PASS для Preview.
`npm run procedural:canary:production` разрешён только после реального device certification + golden baseline.

## Merge
Merge только если Doctor PASS, V10 gate PASS, release gate PASS, Preview PASS, rollback=false, canary PASS, `?pq=off` без регрессии. Production promotion — только после physical device + golden evidence.

## Финальное правило
“Готово” означает не «код компилируется», а «все доступные ошибки найдены, исправлены, покрыты регресс-тестом и весь полный цикл проверок снова успешно пройден».
