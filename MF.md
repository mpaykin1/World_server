# MF — MUST FINISH

**MF = список проектов World Server, которые пользователь прямо потребовал обязательно довести до конца.**

Этот файл — корневой discovery alias для любого нового чата/AI. Машинный источник истины: `data/must-finish-projects.json`.

## Правила MF

1. Проект попадает в MF только по явной команде пользователя.
2. MF-проект нельзя считать завершённым только потому, что есть код, PR, тесты или высокий процент готовности.
3. Удалять проект из MF можно только после явного пользовательского решения, что проект действительно доведён до требуемого результата.
4. `SUCCESS` / `FAILURE` не выдумывать. Если пользователь ещё не дал verdict, хранить `USER_VERDICT_PENDING`.
5. Новый чат, встретив название/alias MF-проекта, должен сначала прочитать этот файл и машинный реестр, затем существующий handoff/PR. Не начинать параллельную реализацию с нуля.
6. Проценты готовности — только evidence-backed. Старый процент из чата не является свежим доказательством.
7. MF — не новая автоматизация и не шестая AKA-задача. Это persistent project registry.

---

## MF-001 — Seed System / Architecture Seeds × Minecraft

**Статус:** ACTIVE / MUST FINISH  
**Пользовательский verdict:** USER_VERDICT_PENDING  
**Последняя evidence-backed оценка, сообщённая пользователю:** 84%  
**Канонический PR:** #414  
**Рабочая ветка:** `ai/chatgpt/architecture-seeds`  
**Cross-chat handoff:** `SEEDS.md` в рабочей ветке/PR #414  
**Aliases:** система сидов, сиды, архитектурные сиды, Architecture Seeds, Seed System, Minecraft seeds

### Цель

Один shareable seed должен детерминированно воспроизводить не только terrain, а целый согласованный World Server мир:

```
WORLD SEED
→ terrain / biome / caves
→ roads / districts / city plan
→ architecture / buildings / landmarks
→ ruins / flooding / history
→ Minecraft block palette / models / structures
→ creatures / props
→ civilizations / NPC relationships / events / persistent world history
```

### Уже реализовано

- точный `seedKey` для больших числовых сидов;
- versioned deterministic sub-seeds;
- Gothic / New York / Ancient Chinese / Tokyo / Future;
- jungle / flooded / ruins / desert / snow / volcanic / islands;
- city-plan + district/building grammar;
- deterministic constraint-collapse facade grammar;
- Seed Hunter;
- World Factory create/preview/hunt;
- integration with canonical Voxel World;
- curated Minecraft import with provenance;
- Minecraft atlas as seeded voxel material palette;
- rare seeded structures/landmarks;
- seed-selected Minecraft GLB set dressing;
- Seed Lab diagnostic/visual lane.

### Evidence checkpoint

- targeted Architecture Seeds + Minecraft suite reached **29/29 PASS** before the final seeded-set-dressing patch;
- Minecraft provenance/VNO audit: **4367/4367 source files accounted for**;
- imported artifacts: **196/196 verified**;
- earlier full Architecture Seeds release gate: **1033 tests, 1031 PASS / 0 FAIL / 2 SKIP**;
- exact-head evidence must be re-run after syncing with current master.

### Must finish before removal from MF

- synchronize/rebase current seed work with latest master without regressing other systems;
- exact-head CI / quality / Fleet / deployment verification;
- desktop + mobile browser visual evidence;
- deeper architecture/landmark diversity;
- turn seeded mobs/props into meaningful actors where appropriate;
- connect seed to civilizations, relationships, factions, resources, conflicts, catastrophes and persistent history;
- prove same seed + generator version reproduces the same semantic world;
- preserve provenance/license boundaries;
- obtain explicit user verdict.

### Continuation rule

If user asks to continue/maximize/finish the seed system, inspect current `master`, PR #414, branch `ai/chatgpt/architecture-seeds`, and `SEEDS.md` before editing. Continue the existing engine; do not create a competing seed system.

