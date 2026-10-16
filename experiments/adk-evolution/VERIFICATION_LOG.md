# Verification log (ADK vs AGES)

Правило: запись считается подтверждённой только если рядом дословный вывод команды, SHA коммита или ссылка на запуск CI. Остальное UNKNOWN.

## Известные ограничения доступа (не повторять эти ошибки)

- Репозиторий приватный (`isPrivate=true`). Публичные страницы GitHub и raw-ссылки без входа дают 404 или устаревшие данные. Для независимой проверки они не годятся.
- Из песочницы ChatGPT api.github.com недоступен (`NameResolutionError`). GitHub-коннектор не читает поля PR (`head.sha`, `commits`) и не умеет push крупных файлов (HTML 427 КБ).
- Работает: Windows `WIN-GJVRHRQPB5A` через Desktop Commander с авторизованным `gh` (scopes: `repo`, `workflow`). Хэши считать только по реальным байтам из `gh api` с `Accept: application/vnd.github.raw` либо по декодированному base64 содержимому GitHub API (проверять SHA-256 и размер).
- Защита master и rulesets недоступны на текущем тарифе (403, `Upgrade to GitHub Pro`); обязательность проверок для слияния по API не подтверждена.
- Netlify deploy-preview: success до 13.10 (PR 379, 491, 496); failure на PR 512 (с коммита `4800125`, 2026-10-15) и на PR 513–517 (2026-10-16). Причина не установлена (Netlify CLI на Windows нет). Операционная классификация владельца: `UNRELATED-TO-EXPERIMENT`; техническая первопричина: `UNKNOWN`.
- 2026-10-16: команда `gh` отсутствует в PATH, исполняемый файл найден: `C:\Users\user\AppData\Local\WorldServerAI\tools\github-cli\gh.exe`.
- 2026-10-16: системный Python на Windows неисправен: `Fatal Python error: init_fs_encoding: failed to get the Python codec of the filesystem encoding`; `ModuleNotFoundError: No module named 'encodings'`. Реальные ADK A/B прогоны не подтверждены.

## Таблица подтверждений

| Дата UTC | Утверждение | Доказательство (вывод, SHA, ссылка) | Статус |
|---|---|---|---|
| 2026-10-16 | PR #512: 19 коммитов; HEAD `f257e00` | `gh pr view 512 --json state,isDraft,headRefOid,commits`: `"commit_count":19,"headRefOid":"f257e0048699c18432848332a52176c76b9819ef"` | CONFIRMED |
| 2026-10-16 | `original.html`: 147725 байт | `Get-FileHash` реальных байтов из `gh api`: `original.html 147725 6856C60E616AA8C1AE8A7292B2E1E7570D663AE287F335623322E3BE66E869CD` | CONFIRMED |
| 2026-10-16 | `improved.html`: 280123 байта | `Get-FileHash` реальных байтов из `gh api`: `improved.html 280123 FDBDA0240B53F49D6E34AA0965531856E31A0154F4A12339E1682D60D5FE5C1F` | CONFIRMED |
| 2026-10-16 | ADK CI success на `f257e00` | `gh run view 38861207239 --json headSha,conclusion,url`: `{"conclusion":"success","headSha":"f257e0048699c18432848332a52176c76b9819ef","url":"https://github.com/mpaykin1/World_server/actions/runs/38861207239"}` | CONFIRMED |
| 2026-10-16 | `full_html_in_github: true` | `gh api repos/mpaykin1/World_server/contents/experiments/adk-evolution/ostrov-baselines-manifest.json` (base64 decoded): `"full_html_in_github": true` | CONFIRMED |
| 2026-10-16 | Lighthouse pass | `lighthouse pass 4m23s` — https://github.com/mpaykin1/World_server/actions/runs/38861207197/job/116844719408 | CONFIRMED |
| 2026-10-09 | Netlify #379 success | `success Deploy Preview ready! 2026-10-09T20:13:57Z` | CONFIRMED |
| 2026-10-13 | Netlify #491 success; #496 success | `#491 success 2026-10-13T06:23:41Z`; `#496 success 2026-10-13T08:55:57Z` | CONFIRMED |
| 2026-10-15 | Netlify #512 success на `6b6398e`, failure с `4800125` | `6b6398e success 2026-10-15T06:54:13Z`; `4800125 failure Deploy Preview failed. 2026-10-15T09:19:14Z` | CONFIRMED (root cause UNKNOWN) |
| 2026-10-16 | Netlify #513–517 failure | `#513 05:42:43Z`; `#514 06:22:26Z`; `#515 05:58:55Z`; `#516 06:08:44Z`; `#517 06:29:58Z`; all `failure Deploy Preview failed.` | CONFIRMED (root cause UNKNOWN) |

## Правила дальше

- Каждый новый отчёт добавляет строки в таблицу с доказательством, и только после этого его пересылают Claude.
- Любая ошибка доступа или неверный вывод записывается в раздел «Известные ограничения» отдельным пунктом с датой, чтобы не повторять.
