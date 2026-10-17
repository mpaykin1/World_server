# AI START HERE — World_server
## graf — графическая политика для каждой игры

**GRAF v1.1 — HARD GRAPHICS GATE:** для всех игровых графических задач обязательно читать [graf.md](graf.md) и полные разделы 21–25 https://github.com/mpaykin1/meta6/blob/main/graf.md . Единая процедурная 3D + GLB/glTF фабрика с 2D/2.5D/3D анимациями; **неплоский настоящий рельеф**, бесконечные бесшовные streamed seeded chunks в любую сторону с ограниченной RAM/GPU; **неподвижный экран телефона, joystick перемещает героя, а НЕ страницу, canvas, мир или камеру**; Eye mode drag лишь отдельным жестом. Проверки: проход >=3 чанков N/S/E/W, seam/height/collision/memory и joystick drag 10s с scroll=0, rect canvas fixed, hero movement, FPS p95, mobile simulation/device separated; любое нарушение viewport/terrain = HARD FAIL, не owner PASS. Не ломать accepted baseline. Референсы OpenTTD Online / Micropolis Web. Ни одного нового AKA scheduler.

Любой новый чат, Claude, Codex или другой агент **перед задачей про графику/анимацию любой нашей игры** обязан прочитать [graf.md](graf.md) и полный общедоступный [GRAF standard](https://github.com/mpaykin1/meta6/blob/main/graf.md). Для гибридного MVP необходимо одновременно реализовать анимированных 2D, 2.5D и 3D персонажей и объекты, а не только их переключатель. Соблюдать игровой baseline, собственные правила веток/PR, визуальное evidence, >85% заметность до новой playable ссылки и пользовательский вердикт PASS/FAIL.


**Любой новый AI-агент, новый чат, Codex, Claude, OpenCode, Jules, browser/cloud agent или локальный помощник должен начинать знакомство с проектом с этого файла.**

Если пользователь спрашивает про архитектуру `World_server`, научные открытия, ВНО, Science→Gameplay, игровые стандарты, агентов, автоматизацию, production или текущую систему проекта — сначала прочитай указанные ниже канонические файлы из `master`, а не отвечай только по памяти чата.

## Текущий приоритет пяти ежечасных ролей ChatGPT (с 2026-10-14)

Решение владельца 2026-10-14: Builder, Fleet, Ocean, Architect и SRE Observer работают над игрой **«Остров сумерек»** (`games/ostrov-sumerek`).
- Порядок — `AGENTS.md` §21 (игры) и §22 (ревью делает ИИ другой компании).
- Роли и текущие PR — [директива в issue #80](https://github.com/mpaykin1/World_server/issues/80#issuecomment-6165494995).
- Доля 50% CLEAN_SERVER / 50% GRAPHICS-DEMO-001 приостановлена; вернуть её владелец может только сообщением в своём чате.

## 0. Обязательный контракт нового чата / ручная работа до результата

Если пользователь просит **внести изменения прямо сейчас**, новый авторизованный чат обязан прочитать [`CHATGPT_GAME_CONTROL.md`](CHATGPT_GAME_CONTROL.md) до начала реализации.

Особенно важно: если запрос означает «измени/почини/добавь и пришли/покажи ссылку, чтобы я мог проверить», активируется `LINK_COMPLETION_LOOP=ON` и `OUTPUT_REQUIRED=VERIFIED_LINK_ONLY`.

Жёсткая машинная политика этой выдачи хранится в `data/manual-delivery-policy.json`, а repo-derived deployment identity — в `data/cloudflare-deployment-identity.json`. Канонический production работает через Cloudflare; его адрес берётся только из результата деплоя или `WORLD_SERVER_CANONICAL_ORIGIN`, а не угадывается. Новые миры должны появляться в Golden Worlds inventory по `/apps/voxel-world/`, а финальная ссылка обязана пройти `npm run delivery:verify -- <cloudflare-url> --expected-sha=<HEAD_SHA>` непосредственно перед ответом.

В таком режиме технический блокер — это следующая подзадача, а не повод закончить отчётом. CI fail, конфликт, deploy fail, 404/500, протухший preview, неправильный SHA, browser failure и отсутствие видимого изменения — всё это `NOT_DONE`, пока доступные авторизованные инструменты могут продолжать исправление.

Допустимый нормальный финал — только свежепроверенная рабочая ссылка с видимым запрошенным изменением. Исключение — настоящий `USER_ACTION_REQUIRED`, когда нужен owner-only шаг, который AI физически не может выполнить доступными инструментами.

Свежий чат также обязан искать текущий resumable checkpoint в каноническом issue #80/task ledger и не создавать конкурирующую реализацию уже активной ручной задачи.

## 0.1. MF — Must Finish

**MF = Must Finish** — канонический список проектов, которые пользователь явно потребовал обязательно доделать и не потерять между чатами.

- человекочитаемый вход: [`MF.md`](MF.md);
- машинный источник истины: [`data/must-finish.json`](data/must-finish.json);
- проверка: `npm run mf:check`.

Если пользователь говорит **MF**, **Must Finish**, «обязательно доделать», «что мы должны закончить» или просит продолжить один из MF-проектов, новый чат обязан открыть `MF.md`, `data/must-finish.json` и handoff выбранного проекта **до** создания новой реализации.

MF — не автоматизация и не новая AKA-задача. Элементы не удаляются и не считаются законченными только из-за наличия MVP/PR/ссылки. Закрытие MF требует выполненных completion criteria и явного подтверждения пользователя.

Текущие MF-проекты:
- **MF-01 Gothic Destruction MVP** → `docs/GOTHIC_DESTRUCTION_MVP_HANDOFF.md`;
- **MF-02 Unified Matter + Voxel Physics / Noita scenes** → `docs/UNIFIED_MATTER_VOXEL_MF_HANDOFF.md`;
- **MF-03 Living Light Cat 3D V4** → `docs/LIVING_LIGHT_CAT_V4_MF_HANDOFF.md`.

## 1. ВНО — главный научно-игровой цикл

**ВНО = Воспроизводимость, Независимость, Опровержение.**

Алиасы для поиска:
- ВНО
- VNO
- Принцип ВНО
- цикл ВНО
- VNO cycle
- reproducibility independence falsification
- reproducibility / independence / falsification
- Воспроизводимость Независимость Опровержение
- Science 100
- scientific readiness
- discovery to gameplay
- Science to Gameplay

Главный человекочитаемый файл: [`VNO.md`](VNO.md).

Машинные правила:
- `.ai/vno-cycle.json` — семь шагов цикла;
- `.ai/vno-scoring.json` — как считаются проценты и почему их нельзя накручивать;
- `.ai/science-governance.json` — общая научная политика;
- `data/vno-gameplay-systems.json` — карта игровых систем;
- `scripts/check-vno-cycle.js` — hard gate цикла;
- `scripts/check-vno-scoring.js` — hard gate процентов.

Простая формула:

`SCIENCE_READINESS = min(REPRODUCIBILITY, INDEPENDENCE, FALSIFICATION)`

Сильные два столпа не могут скрыть слабый третий.

## 2. Семь шагов цикла ВНО

1. взять реальное открытие с evidence;
2. построить следующий проверяемый и опровержимый вопрос;
3. проверить, как открытие может улучшить каждую игровую систему;
4. доказать каждый применимый перенос собственным кодовым тестом;
5. максимально усилить Воспроизводимость, Независимость и Опровержение;
6. превратить найденные ошибки метода в постоянные защиты;
7. вернуться к шагу 1 и запустить следующий цикл.

`NOT_APPLICABLE` разрешён и предпочтительнее выдуманной связи. Одна игровая система не имеет права автоматически доказывать другую.

## 3. Где лежат реальные циклы и evidence

- `science/vno/RUN_###.vno.json` — записи конкретных циклов;
- `science/vno/evidence/` — сохранённые источники/evidence;
- `SCIENCE_STANDARD.md` — полный научный стандарт;
- `docs/SCIENCE_GAMEPLAY_STANDARD.md` — безопасный мост из науки в gameplay;
- `lib/science-gameplay-adapter.js` — существующий runtime-мост, если применимо.

Нельзя считать `pass:true` доказательством закона реального мира. Нужно различать внутреннее подтверждение модели, воспроизводимость, независимость и опровержение.

## 4. Остальная архитектура проекта

После ВНО прочитай по задаче:
- `CHATGPT_GAME_CONTROL.md` — ручная работа, fresh-chat bootstrap, доводка до verified link;
- `.ai/project-context-index.json` — машинный индекс канонических контрактов;
- `README.md` — общий проект;
- `AGENTS.md` — обязательные правила всех AI;
- `work-notes/<ветка>.md` — заметки задачи этой ветки; `WORK_IN_PROGRESS.md` — старый общий журнал, только история;
- `docs/` — профильные стандарты;
- `.github/workflows/` — реальные CI-гейты;
- `apps/`, `shared/`, `lib/`, `api/` — production/runtime код.

## 5. Обязательное правило поиска для нового чата

Если пользователь употребил название, сокращение или концепцию проекта, которых нет в текущем контексте чата:

1. **не просить пользователя сразу повторять определение;**
2. сначала открыть `AI_START_HERE.md` из `master`;
3. затем открыть `.ai/project-context-index.json` и искать точный термин/алиасы в канонических файлах;
4. для ручной разработки и запросов на ссылку обязательно открыть `CHATGPT_GAME_CONTROL.md`;
5. если термин найден — ответить/действовать по серверным данным;
6. только если сервер действительно не содержит определения — честно сказать, что оно не найдено.

## 6. Cloud-first / компьютер пользователя

Проект остаётся cloud-first. Локальные AI не должны захламлять Desktop, создавать бесконтрольные worktree/cache/node_modules/model artifacts, раздувать память или заметно замедлять компьютер. Временные session-owned артефакты должны безопасно очищаться. Замедление компьютера считается регрессией процесса.

---

### Самая короткая версия для любого нового AI

**Сначала прочитай `AI_START_HERE.md` + `.ai/project-context-index.json`. Для ручных изменений прочитай `CHATGPT_GAME_CONTROL.md`. Если пользователь просит изменить проект и прислать ссылку — не заканчивай отчётом при исправимом блокере; продолжай до свежепроверенной рабочей ссылки или настоящего owner-only `USER_ACTION_REQUIRED`. ВНО = Воспроизводимость + Независимость + Опровержение.**


## 7. СЖ — источник истины для авторских текстов Михаила

**Сначала открой `SZH.md` из корня `master`. Не полагайся на GitHub code search: он может временно вернуть 0 результатов для уже существующих файлов.**

Когда задача — написать, переписать, сократить, развить или отполировать персональный авторский текст Михаила, сначала прочитай:

- `docs/SZH_SYSTEM_RU.md` — человекочитаемый канон;
- `.ai/szh-writing-system.json` — машинные правила;
- `lib/szh-writing-system.js` + `scripts/szh-context.js` — исполняемый resolver/context builder.

Алиасы: **СЖ**, **система живого**, **по СЖ**, **живой текст**, **живее**, **убери ИИ**, **как я пишу**, **СП**, **сбитый живой поток**.

Правило приоритета: последняя явная редактура пользователя конкретного текста сильнее первоначального AI-варианта. Сравнивай версии, извлекай кандидаты в новые правила, отличай авторский приём от случайной опечатки. **Не изменяй каноническую СЖ автоматически**: новое правило попадает в источник истины только после явной команды пользователя его зафиксировать.

Для персональных авторских текстов Михаила можно также выполнить `node scripts/szh-context.js --prompt` и использовать выданный контекст перед черновиком. Это правило относится к текстовому авторству; проектные/репозиторные инструкции `AGENTS.md`, `CHATGPT_GAME_CONTROL.md` и другие safety/delivery contracts сохраняют более высокий приоритет в задачах разработки.

Даже без слова «СЖ» используй её как baseline для персональных авторских текстов Михаила, если текущая команда не задаёт другой стиль.


## 8. Готовность TED / мировых СМИ

Постоянная программа AKA для мировой значимости проекта описана в `docs/TED_MEDIA_READINESS_RU.md`.

Машинные источники истины:
- `.ai/ted-media-readiness.json` — 12 систем, веса, анти-накрутка и правила взаимного усиления;
- `data/ted-media-readiness.json` — текущая evidence-backed оценка;
- `scripts/validate-ted-media-readiness.mjs` — исполняемая проверка формулы.

Обязательная строка содержательного AKA-отчёта:

`Готовность TED — N%`

Это не вероятность принятия заявки TED/TEDx/конференцией/СМИ. Это готовность проекта иметь проверяемый повод международного масштаба. Не повышать процент за планы, документацию, промпты или самозаявленные достижения. Использовать существующий AKA; новую автоматизацию для этого не создавать.


## Mandatory tail cycle

Before starting new development, treat `data/desktop-ai-policy.json -> tailBudget` and `lib/tail-budget.js` as canonical. World Server must alternate:

`TAILS -> DEVELOPMENT -> TAILS -> DEVELOPMENT`.

Hard limits: 5 active tails total, 2 dirty worktrees, 3 fresh external pending tasks. If exceeded, do not start a new feature; switch to `tail-closure` until the budget is healthy. Session guard enforces the alternation and master-coordinator reserves capacity before spawning a new agent/worktree.


## 9. World Server Tech Lab — изолированные эксперименты, общая память

Если запрос касается **Tech Lab**, **OpenGame**, экспериментальной игровой графики,
проверок ассетов средневекового мира или восстановления работы лаборатории из нового чата:

1. Прочти канонический [LIVE_STATUS.json](https://github.com/mpaykin1/world-server-tech-lab/blob/main/LIVE_STATUS.json) отдельного репозитория.
2. Прочти [AGENTS.md](https://github.com/mpaykin1/world-server-tech-lab/blob/main/AGENTS.md), затем последнюю запись [checkpoints/history.jsonl](https://github.com/mpaykin1/world-server-tech-lab/blob/main/checkpoints/history.jsonl) и активный эксперимент.
3. Проверь **свежие** HEAD/main, открытые PR, точные CI и дату checkpoint в лаборатории; при устаревших данных считай статус UNKNOWN.
4. Продолжай существующий эксперимент с последнего доказанного шага, не создавай второй игровой движок и не переноси непроверенные компоненты в production.
5. Изменения в лаборатории только через её собственные ветки/PR и CI. Перенос в World Server — только отдельным контролируемым PR с действующими гейтами World Server.

Лаборатория: https://github.com/mpaykin1/world-server-tech-lab

Каноническая память основного проекта остаётся в issue #80.
Доля **50% GRAPHICS / 50% CLEAN_SERVER** приостановлена решением владельца 2026-10-14: пять ежечасных ролей работают над игрой «Остров сумерек» (см. «Текущий приоритет» в начале файла).
Не создавать шестую AKA-задачу, новые платные API, постоянные фоновые процессы,
двойной CI/очереди или нагрузку на production ради лаборатории.
Это **только ссылка для восстановления контекста**, без импорта runtime-кода или деплоя.
Решение пользователя по игровому MVP остаётся UNSET до его явного PASS/FAIL.


## 10. Observer World / Meta6 — все игровые исходники из любого чата

Если пользователь упоминает **Observer World**, **Meta6**, **бесконечный образно-символьный интерактивный роман**, **Наблюдателей**, **мечи**, **дым** или **музыку Krieger** для этой игры, сначала прочитать **публичный индекс исходников**:

- [SOURCE_INDEX.md — все игровые версии, движки, тесты и ссылки](https://github.com/mpaykin1/meta6/blob/main/SOURCE_INDEX.md);
- [game-source-index.json — машинный индекс исходников](https://github.com/mpaykin1/meta6/blob/main/game-source-index.json);
- [исходники Meta6](https://github.com/mpaykin1/meta6);
- [исходник звукового движка новой редакции](https://github.com/mpaykin1/meta6/blob/main/observer-world-en-v2-audio/audio.js).

**Решение владельца 2026-10-16:** Observer World EN V2 = **PASS**. Принятый оригинал `observer-world-en-v2/index.html` не заменять экспериментами. Новая процедурно-музыкальная версия находится отдельно в `observer-world-en-v2-audio/` и до нового пользовательского PASS является отдельной проверяемой редакцией.

Публичный GitHub является долгосрочным источником файлов: **другому чату не требуется, чтобы пользователь пересылал HTML или JS заново**. Достаточно прочитать индекс, затем актуальные версии файлов. Это не означает автоматическую синхронизацию памяти между разными чатами и не даёт доступ к приватным секретам/локальным сохранениям игрока. Соблюдать обычный lifecycle проверок, review и link completion.

**GRAF v1.2 REQUIRED MOBILE FOLLOW-CAMERA & PIXEL ACTION ICONS:** до работы над графикой/мобильным управлением прочитай [graf.md](graf.md) и https://github.com/mpaykin1/meta6/blob/main/docs/graf-mobile-follow-camera.md . Canonical reference «Остров сумерек(7).html»: **HTML screen/canvas/HUD закреплены, но игровая камера ПЛАВНО следует за движущимся персонажем** с damping/velocity lead и collision avoidance; джойстик слева двигает героя camera-relative и НИКОГДА не вращает камеру напрямую, независимый touch правой стороны вращает camera yaw/pitch и может использоваться одновременно с джойстиком/правой кнопкой. На телефоне **каждое действие — своя уникальная пиксель-арт иконка БЕЗ ВИДИМОЙ НАДПИСИ** (оставить aria-label), layout уже одобренных игр не ломать, на ПК телефонные кнопки скрыты. Это уточнение отменяет неверное толкование fixed viewport как полного запрета camera-follow. Acceptance: 10s touch joystick, hero coords change + camera target tracks with damping, canvas bounds constant, window scroll=0, independent two-pointer right orbit/action, icon uniqueness, wall/terrain collision, FPS p95, real-device distinct from simulated; нарушение = HARD FAIL. Весь остальной GRAF v1.1 (неплоский бесконечный рельеф, GLB/procedural, 2D/2.5D/3D) обязателен.
