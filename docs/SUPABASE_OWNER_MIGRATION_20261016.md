# World Server: перенос Supabase владельцу (2026-10-16)

Status: SOURCE_AUDITED / TARGET_REF_KNOWN_NOT_API_VERIFIED / OPTIMIZATION_DRY_RUN_AVAILABLE / NO_CUTOVER.

## Источник подтверждён

- Supabase ref: iphfwxjuhsucvdyluink, PostgreSQL 17, ACTIVE_HEALTHY.
- Database size: 542846099 bytes (about 518 MiB). Free Supabase has 500 MB database size limit.
- 113 tables in public, 38 in private, 27 in auth, 8 in storage.
- Source migration ledger: 144 entries. GitHub master supabase/migrations: 10 files. Do not expect repo migrations to reproduce production.
- 16 ACTIVE Supabase Edge Functions; several source deployments must be recovered separately.
- Storage buckets: image-world-sources and image-world-output; storage.objects currently has 0 rows.
- Auth: 3 users. Never replay active refresh/session tokens.
- Valuable data: voxel worlds, player saves, world events, animation policies, stories, project context, and quality learning state.

Largest tables (including indexes): private.quality_runtime_scores (167MB), public.gap_closure_evidence (93MB), public.gap_closure_runs (90MB), private.quality_autopilot_runs (83MB), cron.job_run_details (45MB). These histories must be archived, not silently discarded or copied into the Free tier.

## Target

Owner-controlled target confirmed from owner dashboard: world-server-preview, project ref xlcdnlsyvxqtopmkweiy, org Improve (ayoxcnfmwbpmwwhdeljs). Owner has resumed the project. ChatGPT Supabase connector still sees SOURCE ONLY, so API connection and existing destination data have NOT been independently verified. No destination operations have occurred.

Next action: authenticate the target via Codex, run a read-only query, inspect existing target data and take its backup before changes. Use https://supabase.com/dashboard/project/xlcdnlsyvxqtopmkweiy when owner UI is needed.

Exact deployed source (16 functions, 19 source files) was recovered into experiments/supabase-owner-migration/edge-deployed-20261016. This is an archive only, not automatic redeployment. Review each function and reconfigure its environment first.

## Source backup automation

- Manifest: data/supabase-owner-migration-20261016.json
- Node script: scripts/supabase-owner-migration.cjs
- Requires PostgreSQL 17 client programs psql and pg_dump in PATH.
- Set WS_SOURCE_DATABASE_URL to a private authorized source Postgres session connection string.
- Set WS_TARGET_DATABASE_URL to a private authorized target Postgres session connection string.
- Keep URLs in machine environment, not in chat, public frontend, Git or CI logs.

Commands:

    node scripts/supabase-owner-migration.cjs audit-source
    node scripts/supabase-owner-migration.cjs audit-target
    node scripts/supabase-owner-migration.cjs backup
    node scripts/supabase-owner-migration.cjs verify

Backup writes outside repo:
Windows: %LOCALAPPDATA%\WorldServerAI\archives\supabase-owner-migration-20261016
Unix: ~/.local/share/WorldServerAI/archives/supabase-owner-migration-20261016

The script does not change either DB. It produces a FULL confidential local archive (public + private + auth data) and a SELECTIVE archive (public + private, excluding history and temporary/secret-bearing rows according to manifest). The full archive contains highly sensitive credentials/data and MUST remain securely stored offline. It refuses to overwrite an existing archive.

Blocking dependency: currently connected Supabase tools can query source SQL but do NOT expose its Postgres login password. A temporary restricted export credential or another authorized Postgres source connection must be established before CLI pg_dump can run. The paused target project also needs identification and authentication.

## Обязательная модернизация одновременно с переносом (owner directive 2026-10-16)

Перенос должен улучшить World Server, а не просто переместить данные. Оптимизировать TARGET до переключения, но не стирать SOURCE. Машинная политика в data/supabase-owner-migration-20261016.json поле optimization.

Автоматически подготовить план (никаких записей в БД):

    node scripts/supabase-migration-optimizer.cjs plan

После появления авторизованного readonly SOURCE Postgres DSN — получить реальные размеры ВСЕХ public/private таблиц:

    node scripts/supabase-migration-optimizer.cjs source-plan

Классифицировать каждую таблицу, зависимость Edge Function, задачу cron, очередь и индекс:
- MUST_KEEP: рабочие миры, прогресс, состояние игрока, бэкенд, анимации, доказанное улучшение и полезная память обучения.
- ARCHIVE_THEN_SUMMARIZE: исторические метрики, логи исправлений, пробы и старые запуски; компактная память о причинах успехов/ошибок, но НЕ вердикт PASS/FAIL от ИИ.
- RECREATE_NOT_COPY: временные leases, зависшие работы, истёкшие токены, устаревшие секреты и флаги прогресса.
- REVIEW_DEPENDENCIES: неиспользуемые таблицы/функции/индексы/очереди по реальным ссылкам, RLS, FK, log evidence и runtime-тестам, а не только по размеру или отсутствию результатов code search.

При оптимизации: дедупликация scheduler/cron, лимиты роста телеметрии, анализ планов медленных SQL, удаление ненужных индексов ТОЛЬКО после измерений. Перестраивать систему без необходимости запрещено.

На КАЖДОМ шаге фиксировать до/после: размер базы, количество активных и дублирующихся cron/worker jobs, p95 latency (если инструментально доступен), пользовательские сценарии и состояние игрового мира, runtime Edge Functions. Цель: **сохранить функциональный паритет + подтвердить хотя бы одно реальное измеримое улучшение**. Если метрика не измерена — UNKNOWN, не PASS.

Классификация из манифеста является ГИПОТЕЗОЙ, пока не пройдены аудит зависимостей и реальный экспорт; большой размер != мусор. Архив source должен быть создан и проверен восстановлением прежде чем проводить исключение данных. Старую базу не чистить без отдельного решения. Новую не переключать на prod до доказанной работоспособности.

Тесты автоматизации:

    node --test test/supabase-migration-optimizer.test.js

Результат Dry-run отправить второму Codex и внести в checkpoint. Статус успеха или провала MVP определяет только пользователь своим PASS/FAIL.

## Mandatory gates before switching production

1. Resume and inspect target; preserve its pre-existing data.
2. Obtain source read-only export and target admin connections.
3. Run backup; validate archives with pg_restore --list; record hashes outside Git.
4. Test a selective restore into disposable/empty target namespace. Never use pg_restore --clean on occupied target.
5. Restore schema, extensions, private functions, triggers, RLS, grants and dependencies. Address Auth identities and foreign keys deliberately.
6. Redeploy selected Edge Functions and recreate needed secrets/cron/webhooks through the target account. Old keys must be rotated, not blindly copied.
7. Verify world/game state, player save/load, private memory, quality loop, Edge Functions, security advisors, regressions, browser/mobile and rollback. Compare source and target data.
8. Gradually switch deployment bindings only after LIVE evidence; old source remains untouched as fallback.
9. No PASS/FAIL attribution until the owner explicitly decides. Success/failure analysis commits follow only after that decision.

Important: verify command compares key table row counts; it is a starting guard, NOT proof of full functional equivalence. Do not invent a visibility score. Target project settings, auth-provider configuration, users' active sessions, storage object bytes, service secrets and third-party bindings are outside a SQL dump.

Official guides:
- https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/platform/free-project-pausing
