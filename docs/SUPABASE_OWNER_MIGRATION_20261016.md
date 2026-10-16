# World Server: перенос, очистка и модернизация Supabase

Состояние: AUTOMATION_LOCALLY_VERIFIED / LIVE_ACCESS_REQUIRED / NO_CUTOVER.
Вердикт владельца: PENDING. Продолжается существующий PR #514, ветка
ai/supabase-owned-migration-20261016. Новый MVP ещё не предъявлен для PASS/FAIL.

## Источник и назначение

Источник — iphfwxjuhsucvdyluink. В предыдущем аудите от 2026-10-16 записаны
PostgreSQL 17, 542846099 байт базы, 113 public, 38 private, 27 auth и 8 storage
таблиц, 144 записи migration ledger, 16 активных Edge Functions и 3 пользователя.
Это исторические наблюдения другой сессии: текущий Codex не повторял SQL-аудит
production. В Git имеется только 10 SQL-миграций; они не воспроизводят живую схему.

Назначение — существующий owner-controlled world-server-preview,
ref xlcdnlsyvxqtopmkweiy, организация Improve (ayoxcnfmwbpmvwhdeljs).
Проверка PAT через GitHub Actions 2026-10-16: секрет присутствует; Supabase
Management API ответил HTTP 200, подтвердил project ref и имя world-server-preview;
organization_id уточнён по live-ответу. SQL-доступ к TARGET, состояние данных
и пригодность к переносу по-прежнему требуют отдельной проверки. Нельзя создавать вместо него другой проект.

Архив исходников 16 развёрнутых Edge Functions (19 файлов):
experiments/supabase-owner-migration/edge-deployed-20261016.
Это источник для анализа, не разрешение автоматически развернуть все старые
процессы и секреты. Оба production binding и старая база сохраняются.

## TARGET-FIRST: World Server 2.0

Пользователь предложил строить новый, улучшенный World Server в собственном аккаунте.
**Новый PostgreSQL уже существует:** `world-server-preview` (`xlcdnlsyvxqtopmkweiy`).
Создавать третий пустой Supabase-проект не нужно.

Независимая live-инвентаризация сопоставила 113 старых и 32 новых public-таблицы:
15 общих, 17 только TARGET, 98 только SOURCE. TARGET уже хранит новые
подсистемы обратной связи, переводов и функций мира. Нельзя перезаписывать
их старым dump. В TARGET все 32 public таблицы имеют RLS enabled, но политики
безопасности требуют самостоятельного аудита. Все подробности и блокирующие
условия — в [TARGET-FIRST handoff](SUPABASE_WORLD_SERVER_V2_TARGET_FIRST_20261016.md).
Никаких live изменений данных, очистки или cutover эта инвентаризация не выполняла.

## Фактическая live-проверка доступа, 2026-10-16

- SOURCE проверен через Supabase connector, SQL read-only: PostgreSQL 17.6, 113
  таблиц public, 27 auth, 8 storage; размер БД 518 MiB (pg_size_pretty: 518 MB).
  Получен каталог 16 ACTIVE Edge Functions. Это не полный pg_dump.
- TARGET проверен автоматическим GitHub Actions run 38856067636 через
  SUPABASE_ACCESS_TOKEN, сохранённый как repository Actions secret:
  https://github.com/mpaykin1/World_server/actions/runs/38856067636
  Management GET вернул HTTP 200 и подтвердил xlcdnlsyvxqtopmkweiy,
  world-server-preview, org ayoxcnfmwbpmvwhdeljs, ACTIVE_HEALTHY.
  Отдельный Management API /database/query/read-only вернул успешный результат
  и 32 таблицы public. Токен не выводился в логи.
- SOURCE 113 против TARGET 32 означает **неполную подтверждённую миграцию**,
  а не допустимость перезаписи TARGET или удаления прежнего SOURCE.
  Точные данные TARGET, полный backup и restore до сих пор не верифицированы.
- Итог ограничен metadata/SQL-read-only. Это **не** подтверждение наличия
  direct/session PostgreSQL DSN, сохранности данных, Auth/Storage/Edge паритета,
  оптимизации, cutover или пользовательского PASS.

## Проверенные ограничения доступа этой сессии

Есть публичный ключ SOURCE: проверены Auth settings, публичная схема voxel_worlds
и Supabase SDK, без записи данных. Он не даёт SQL-доступ, приватную память, cron,
резервный pg_dump или административные игровые API.

В именах переменных и метаданных среды отсутствовали рабочие
WS_SOURCE_DATABASE_URL, WS_TARGET_DATABASE_URL и SUPABASE_ACCESS_TOKEN.
Требования сохранены в черновике среды. Значения вводятся в настройках безопасно,
не в чате и не в Git. Postgres DSN нужен напрямую локальному libpq, поэтому
HTTPS proxy-secret placeholder не заменяет пароль нативного Postgres-соединения.

Git read/API для PR работают. Чтение метаданных repository/environment secrets
через GitHub API вернуло HTTP 403 Resource not accessible by integration.
Секреты других систем не извлекались. Без этих подключений живые архивы,
перенос, оптимизация TARGET и функциональный паритет остаются NOT_VERIFIED.

## Что исправлено в существующей автоматизации

Старый backup ограничивался public/private/auth, применял --no-privileges,
--no-owner и строил selective dump по гипотезам до restore rehearsal.
Теперь такой путь исключён: создаётся полный логический pg_dump всей БД,
с ACL и владельцами, без автоматических исключений. Storage blobs, настройки
платформы, глобальные роли и пароли кластера в логический dump не входят.

Каждый архив использует удерживаемый экспортированный REPEATABLE READ READ ONLY
snapshot. Каталог capabilities и все секции аудита читают один такой snapshot.
DSN разбирается в приватные libpq variables, не передаётся через argv;
PGDATABASE с URI не используется: libpq не раскрывает его как routing URI.
LIVE соединения проверяют project ref и используют TLS verify-full с проверкой
имени сервера; transaction pooler на порту 6543 не поддерживается.

Архивы, TOC и manifest имеют режим 0600, каталог 0700, находятся вне checkout.
Manifest хранит SHA256, размер, project/migration/snapshot provenance, scope.
Перезапись, symlink/hardlink, неполные dump и изменение содержимого блокируются.
pg_restore --list проверяет TOC, но никогда не считается восстановлением.
Полные auth/секретные данные архива конфиденциальны и не коммитятся.

Все SQL-секции выполняются read-only с таймаутами. Ошибка одной секции
фиксируется как UNAVAILABLE с SQLSTATE, затем выполняются оставшиеся секции.
Определения функций, cron-команды и query text выходят только как SHA256;
auth/storage/queue payload не выводятся. Каталоги охватывают все пользовательские
схемы, таблицы/партиции/колонки, views/sequences, FK/constraints, RLS/policies,
функции/триггеры, dependencies, ACL/default ACL, индексы, extensions,
cron/history, pgmq и pg_stat_statements при наличии разрешений.
NOT_PRESENT, UNREADABLE и UNKNOWN не выдаются за проверенную пустую систему.
Внешние schedulers, динамический SQL и Edge callers требуют отдельного анализа.

Сравнение priority tables проверяет count и SHA256 полного канонического
мультимножества строк. Оно обнаруживает одинаковое число изменённых строк.
row_security=off заставляет PostgreSQL отказать вместо хеширования скрытых RLS
нулевых результатов; UTC, DateStyle, IntervalStyle и float/bytea output
нормализованы. Независимые live snapshots сами по себе не доказывают соответствие
архиву: для финального переноса нужны привязка к restore и catch-up/delta protocol.

## Команды

Нужны проверенные PostgreSQL 17 psql, pg_dump, pg_restore. В текущей cloud-среде:

    source /workspace/.cache/world-server-pg17/env.sh

Повторяемая установка для Debian 13 amd64:

    bash scripts/install-postgres17-cloud.sh

WS_PG_BIN_DIR указывает каталог bin; инструменты получены из подписанного
официального Debian HTTPS, SHA256 пакетов и распакованных файлов проверены.
Внешние подключения должны быть direct/session connections; секреты — только
в окружении. WS_PG_SSLROOTCERT при необходимости задаёт доверенный CA-файл.
Не выключать проверку TLS для живых подключений.

Аудит и полный архив (без записей в SOURCE или TARGET):

    node scripts/supabase-owner-migration.cjs audit-source
    node scripts/supabase-owner-migration.cjs audit-target
    node scripts/supabase-owner-migration.cjs backup-source --label source-full-001
    node scripts/supabase-owner-migration.cjs backup-target --label target-before-001
    node scripts/supabase-owner-migration.cjs verify-archive --label source-full-001
    node scripts/supabase-owner-migration.cjs verify

backup — совместимый alias backup-source. Уникальная метка сохраняет предыдущие
и частично созданные архивы. WS_MIGRATION_ARCHIVE_DIR или --output-dir задаёт
приватный каталог вне Git; для cloud предложен /workspace/.world-server-migration-archives.
verify возвращает ненулевой exit при различии/недоступности, сохраняет подробный
приватный отчёт и не выдаёт совпадение хешей за readiness или owner PASS.

Планирование, сохранение обучения и проверка полноты доказательств:

    node scripts/supabase-migration-optimizer.cjs plan
    node scripts/supabase-migration-optimizer.cjs source-plan
    node scripts/supabase-owner-migration.cjs learning-summary --input-file /private/observations.json
    node scripts/supabase-owner-migration.cjs readiness --evidence-file /private/evidence.json

Источник структуры evidence — test/supabase-migration-evidence.test.js.
Это только тестовый пример; его synthetic поля/хеши нельзя копировать в живое
доказательство. Readiness сверяет LIVE provenance, полные восстановленные архивы,
backup существующего TARGET, весь inventory, идентичность данных, функциональные
контракты, rollback, сопоставимые метрики и хотя бы одно измеренное улучшение без
регрессий. Неизмеренный p95 остаётся UNKNOWN. Даже READY_FOR_OWNER_REVIEW
не разрешает cutover и не выбирает PASS/FAIL.

Отдельный read-only REST probe нового проекта:

    node scripts/supabase-owner-target-probe.cjs

Предпочитать WS_TARGET_SUPABASE_URL и WS_TARGET_SUPABASE_SECRET_KEY целой парой.
Не заменять глобальную production-конфигурацию ради probe. Смешивание source key
и target URL, другой origin, redirect, пустой JSON/ложный OpenAPI, ошибки сети
и утечка ключа через diagnostics проверяются тестами. REST OpenAPI не доказывает
SQL-архив, перенос или пригодность нового World Server.

## Политика очистки и измерений

Большие quality_runtime_scores, gap_closure_evidence/runs, quality_autopilot_runs
и cron.job_run_details могут содержать полезные наблюдения. Сначала полный
проверенный архив и его изолированное восстановление, затем dependency/runtime
audit и сохранённое обучение, затем только обоснованная работа на TARGET.

Очереди world_remote_tasks, quality_worker_jobs, browser tasks содержат результаты,
ошибки, retry/dead-letter и незавершённую работу. Whole-table reset не разрешён.
CAS config хранит bearer_sha256/leader_bearer_sha256, используемые авторизацией:
копирование полезной конфигурации не должно сохранять старый доступ. Нужны
проверенные правила для строк/колонок и пересоздание target credentials.

Ротация credentials и Auth remapping закономерно меняют полный fingerprint строк.
Нельзя объявлять такие строки идентичными: до финального readiness нужны отдельные
проверенные преобразования, архив исходных значений и доказательство сохранения
всех остальных полей/ссылок. Текущий строгий gate не обходит эту необходимость.

Приоритеты дополнены доказанными callers: world_canon_events,
chain_reaction_world_members/private_events, pixel_animation_learned_policy
и pixel_animation_device_baselines. Это список для проверки, не доказательство
полной coverage. Даже preserve требует проверки FK, ACL, owners и runtime.

Нулевые scans индекса, одинаковые job signatures и размер истории — кандидаты.
Они не разрешают DROP/DELETE. Idle runtime-score writes и публичная telemetry
без видимого rate/retention limit требуют измерения реальной частоты, SQL callers
и полезных переходов/ошибок перед target-side дедупликацией или retention.

## Автоматические проверки и фактические доказательства

Одна команда создаёт/удаляет собственные локальные PostgreSQL 17 кластеры,
архивирует занятый fixture TARGET до изменений и восстанавливает SOURCE только
в свежую staging fixture database; живые DSN/секреты не используются:

    node scripts/validate-supabase-migration.cjs --with-core

Выполненный набор: 140 тестов, 140 прошли, 0 пропущено. Проверены SQL-каталоги,
ограниченная роль, RLS/timezone/fingerprint контрпримеры, полный реальный dump,
restore, ACL/SECURITY DEFINER/default grants/policies, hash/TOC tampering,
перезапись и owner/metric gates плюс 64 существующих core проверки.
Местные cron/pgmq/pg_stat_statements представлены таблицами подходящей структуры,
а не установленными/запущенными remote extensions.

На fixture доказанный дубликат вторичного индекса занимал 32768 байт:
relation size 360448 → 327680, 120 результатов запроса и fingerprint 28 таблиц
сохранились. Это проверка метода LOCAL_FIXTURE, не улучшение живого World Server.
p95 нового production, экономия его ресурсов и полный функциональный паритет
не измерены. Машинный отчёт и сырой безопасный test output хранятся в
experiments/supabase-owner-migration/validation-20261016/.

check:fast, architecture (base origin/master), mf:check, indieworlds:check
выполнены отдельно. Полный npm run check/release:gate не запускался:
автопоиск node --test захватывает генераторы tracked reports и интеграции,
создающие worktree. Новый runner перечисляет проверяемые файлы явно.

## TARGET PostgreSQL native authentication probe — 2026-10-16

GitHub Actions `supabase-target-access-probe.yml` подтвердил наличие
`WS_TARGET_DATABASE_URL` как GitHub Actions Secret. Проверка management API
и SQL-read-only target остаётся PASS, `world-server-preview` ACTIVE_HEALTHY
и `public` содержит 32 таблицы.

Native libpq проверка сначала отклонялась из-за отсутствующей Supabase Root CA
в системном trust store GitHub runner (не из-за неверного пароля). В CI добавлена
загрузка официального сертификата Supabase
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`,
проверка X.509/subject и указание `WS_PG_SSLROOTCERT`; TLS остаётся
`sslmode=verify-full`. Последний live-run
https://github.com/mpaykin1/World_server/actions/runs/38860687683
подтвердил загрузку официального CA, но классифицировал ошибку native login как
`PASSWORD_REJECTED`. Поэтому **WS_TARGET_DATABASE_URL присутствует, но не
является подтверждённым рабочим подключением**; резервную копию TARGET
пока создавать нельзя. Пароль в чат/Git/логи не экспортировался. Источник
`WS_SOURCE_DATABASE_URL` в CI по-прежнему отсутствует. Владелец должен безопасно
сверить/заменить реальный пароль нового проекта и обновить GitHub Actions Secret,
затем повторить probe. Скомпрометированный ранее скриншотом пароль желательно
сменить после обновления подключений.

`NO_ARCHIVE / NO_CUTOVER / OWNER_VERDICT_PENDING`.

## Следующий живой этап

1. Получить авторизованные SOURCE export/session и TARGET admin/session DSN;
   management token нужен для фактических Edge deployment/config.
2. Проверить свежие оба каталога и существующие данные TARGET.
3. Создать полные архивы SOURCE и TARGET, проверить hashes/TOC и восстановление
   в изолированном окружении с контролируемым role mapping.
4. Спроектировать Auth identity mapping без sessions/refresh tokens, сохранить
   FK/RLS/grants/SECURITY DEFINER owners, Storage bytes/buckets и внешние bindings.
5. По реальным dependencies выбрать перенос и target-only оптимизации;
   восстановить данные, пересоздать необходимые Edge/cron/queues без дубликатов.
6. Проверить реальные save/load/auth/realtime/world/private memory/learning,
   browser desktop/mobile, security, rollback и размер/частоту/p95 до/после.
7. Обеспечить final delta/catch-up, не теряя текущих записей старого production.
8. Только после готового MVP предоставить результат владельцу для PASS или FAIL.
   До его решения не ставить verdict и не очищать/переключать старый production.
