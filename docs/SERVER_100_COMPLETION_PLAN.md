# World_server — план завершения до честных 100%

Обновлено: 2026-09-08.
Цель: довести сервер до 100% только по реальным машинным доказательствам, без fake PASS, пропуска тестов или подмены внешних проверок синтетическими.

## Текущая база
- Structural readiness: 100%.
- Evidence confidence: 100%.
- Operational readiness: 95%.
- Control plane: 76/76 PASS.
- Integration self-test: 91/91 PASS.
- Honest-100: 76/76 PASS.
- Release promotion: CANARY allowed.
- Desktop zero-chaos: PASS.

## P0 — внутренние блокеры
1. Worktree hygiene: hard limit должен проходить; удалять только clean + merged/proven-safe worktrees.
2. Dependency security: OSV scan должен оставаться 0 findings; package-lock обязан материализовать security overrides.
3. Windows report writes: EPERM/EBUSY не должны обрывать gate; regression test обязателен.
4. Local gates: blocker-repair не должен содержать requires_ai по исправимым локальным причинам.
5. Полный control-plane verify и release gate должны проходить после каждого P0 изменения.

## P1 — внешние доказательства до 100%
1. Independent remote CAS peer: настроить реальный URL вне localhost, проверить auth, digest, replication и read-repair.
2. Physical Android evidence: подключённое реальное Android-устройство, свежий Appium/ADB proof, без эмулятора.
3. Physical iOS evidence: свежий proof с реального iPhone/iOS worker; Windows simulator не считается.
4. Live fenced migration: реальный план expand -> migrate -> verify -> contract с актуальным fencing token и rollback evidence.
5. Long soak >= 8h: только после зелёных детерминированных prereqs; checkpoint/resume, без unrecovered invariant violations.
6. Production proof: exact verified canary -> public production; HTTP/API/browser smoke без login/protection.

## Порядок выполнения
- Сначала закрывать P0 root cause, затем повторять targeted tests -> blocker tick -> control-plane -> release gate.
- Затем выполнять P1 по принципу: configure -> collect real evidence -> regression -> canary -> recheck readiness.
- Никогда не менять `master` напрямую: task branch/PR, точный проверенный commit, затем merge/promotion.
- Не создавать дополнительные репозитории/worktree без необходимости; временные данные только вне Desktop.
- Один write-agent на worktree; read-only reviewers могут работать параллельно при низкой нагрузке.
- Зависший локальный AI останавливается; компьютерная отзывчивость является частью correctness.

## Definition of Done = 100%
100% разрешено показывать только когда одновременно:
- нет исправимых `requires_ai` / P0 blockers;
- control plane и mandatory local gates PASS;
- remote CAS failure-domain evidence PASS;
- свежие Android + iOS physical-device evidence PASS;
- live fenced migration evidence PASS;
- long-soak certified >= 8 wall-clock hours;
- production URL публично доступен и проходит browser/API smoke;
- изменения committed, pushed, reviewed/verified и безопасно интегрированы без потери чужой dirty work.

Если внешний ресурс физически недоступен, статус остаётся честно WAITING/EXTERNAL; такой блокер нельзя превращать в PASS кодом или фиктивным отчётом.
