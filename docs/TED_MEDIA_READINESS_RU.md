# Готовность TED / мировых СМИ — постоянный контур AKA

## Что измеряет метрика

**Готовность TED %** — это не вероятность того, что TED/TEDx, конференция или редакция примет заявку.

Это процент готовности World Server иметь **доказуемый повод международного масштаба**: работающий необычный феномен, ясную формулировку новизны, воспроизводимость, независимую проверку и короткое публичное доказательство.

Обязательная строка каждого содержательного AKA-отчёта:

```
Готовность TED — N%
```

Процент нельзя повышать за планы, документы, красивые формулировки, количество коммитов или прошедшее время.

## 12 систем, сумма весов = 100%

| Система | Вес | Что должно стать доказанным |
|---|---:|---|
| World Causal Engine 2.0 | 12 | длинные цепочки action → relation → flow → delay → threshold → event → new entity |
| Authoritative Eternal World | 10 | единый серверный мир живёт, хранит revision/event log и продолжает последствия |
| Free Intent → World Rule Compiler | 10 | свободная мысль превращается в ограниченный typed проект/правило, проверяемое симулятором |
| Emergent Society Engine | 9 | память, цели, отношения, группы, институты и конфликты возникают из состояния мира |
| Shared Causal World | 9 | действие A переживает сессию и становится условием действия B в том же мире |
| World Provenance / Causal Replay | 10 | любое значимое событие можно объяснить и воспроизвести по seed/event lineage |
| World Experiment Engine | 8 | публичные проверяемые эксперименты над мирами/группами с данными и replay |
| Independent Evidence Network | 8 | независимая exact-revision проверка и внешний reproduction package |
| World Recipe Standard | 6 | переносимый versioned формат сущностей/законов/relations/agents/visual rules |
| Creator / Fork / Share | 5 | создать → опубликовать → fork → remix → play → lineage |
| Novelty & Prior-Art Validator | 6 | свежая проверка похожих игр, GitHub, papers и точности world-first claims |
| World-Scale / 60-sec Demo | 7 | один короткий end-to-end опыт, который показывает феномен без длинного объяснения |

## Текущий baseline

На master `44385eaca11a3ee112113518da676e8fdfbb5af7` консервативная evidence-оценка:

**Готовность TED — 23%**

Это baseline, а не пользовательская оценка «успех/неуспех».

Основные доказанные кирпичи уже есть: live AI prediction gate, NO/YES mutation contract, procedural representations, persistent visible Meta6 relations, Supabase/realtime foundations, VNO и независимый review pipeline.

Основная нехватка: эти кирпичи ещё не замкнуты в один длительно живущий, свободно программируемый намерением, общий и независимо воспроизводимый феномен.

## Взаимное усиление

AKA должна предпочитать не 12 независимых фич, а **shared vertical slices**, которые усиливают несколько систем одновременно.

Примеры:

- authoritative event log + replay → Eternal World + Shared World + Provenance + Experiment + Media Demo;
- free intent compiler + typed causal recipe → Intent Compiler + Causal Engine + Recipe Standard + Demo;
- A→EVENT→B→CONTINUE → Shared World + Eternal World + Creator/Share + Demo;
- VNO reproduction bundle → Independent Evidence + Experiments + Novelty validation + Demo.

**Synergy не добавляет бонусные проценты.** Она только повышает приоритет задачи. Баллы растут лишь от evidence.

## Жёсткие потолки

- без runtime evidence система не может считаться >60%;
- без независимой exact-revision проверки — >80%;
- без повторяемого внешнего/public reproduction evidence — >95%;
- world-first claim запрещён без свежего prior-art audit;
- UNKNOWN лучше выдуманного числа;
- регрессия или дисквалификация evidence обязана уметь уменьшать процент.

## Цикл каждого AKA-прогона

1. Свежепроверить master, issue #80, активные PR и новые evidence.
2. Пересчитать все 12 систем.
3. Найти самый сильный общий bottleneck.
4. Найти способ одним bounded slice усилить этот bottleneck и минимум одну соседнюю систему.
5. Реализовать/проверить реальную capability, если это безопасно и не конфликтует с ownership.
6. Добавить regression/replay/falsification evidence.
7. Изменить проценты только там, где появилось новое доказательство.
8. В отчёте показать:
   - `Готовность TED — N%`;
   - Δ к предыдущему прогону;
   - какая система изменилась;
   - точный evidence: SHA/PR/test/runtime/replay;
   - какой cross-system эффект получен;
   - самый сильный оставшийся blocker;
   - следующий highest-leverage slice.

## Приоритетная причинная цепочка

Главная целевая демонстрация:

```
свободная мысль человека
→ typed проверяемый проект
→ AI прогнозирует, но не исполняет
→ человек подтверждает
→ authoritative world mutates
→ возникает видимая связь
→ delayed consequence
→ NPC/общество реагирует
→ другой человек входит в тот же мир
→ видит последствия и продолжает цепь
→ PROVE IT показывает seed/event lineage/replay
```

Когда эта цепочка работает публично, повторяемо и независимо проверяемо, она одновременно поднимает почти все 12 систем.

## Связанные файлы

- `.ai/ted-media-readiness.json` — машинный контракт;
- `data/ted-media-readiness.json` — текущее evidence-backed состояние;
- `scripts/validate-ted-media-readiness.mjs` — проверка формулы и обязательной evidence-дисциплины;
- `.ai/aka-serial-growth-engine.json` — AKA contract;
- `docs/SERIAL_GROWTH_ENGINE.md` — человекочитаемый AKA loop;
- `VNO.md` — воспроизводимость, независимость, опровержение.
