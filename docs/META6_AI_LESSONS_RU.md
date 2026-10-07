# Meta6 — уроки для других AI-агентов

Этот файл специально написан как короткий набор правил для новых чатов.

## Что уже получилось

1. **Не нужно начинать заново.** Meta4, Meta5 и Meta6 — последовательные доказательства.
2. Игроку нравится, когда мир удобно двигать.
3. Игроку нравится, когда действие порождает настоящий графический объект.
4. Иероглифы работают как язык интерфейса.
5. Live AI работает лучше как forecast gate, а не как скрытый исполнитель.
6. Объекты должны взаимодействовать **видимо**.
7. Action deck должен постоянно оставаться живым.

## Самая важная мысль

Не делай так:

    object A
    object B
    numbers changed

Делай так:

    object A
    -> visible relation
    -> visible behavior
    -> object B
    -> state consequence

## Не ломать

Нельзя ухудшать:

- pan;
- pinch;
- fixed viewport;
- exact placement;
- glyph labels;
- procedural graphics;
- live AI;
- NO/YES gate;
- local report;
- continuous five-slot deck.

## Не повторять ошибку Meta5 deck

Плохо:

    use 5 cards
    -> then get 5 more

Правильно:

    use 1
    -> replace 1
    -> still 5 active

## Не повторять ошибку с «Идеей»

Не считать action working только потому, что:
- он есть в catalog;
- backend его принимает.

Проверять end-to-end:

    physical/card touch
    -> selected state
    -> world tap
    -> modal
    -> live AI
    -> YES
    -> visible object

## Не скрывать ошибки AI

Если provider не ответил:

- показать loading/error;
- дать Retry;
- не менять мир;
- не подставлять фальшивый forecast.

## Не путать MVP animation с simulation

Moving dots ≠ logistics.
Smoke ≠ physical field.
Line ≠ road graph.

Можно использовать visual proxy, но в документации честно обозначать его как proxy.

## Не делать AI authoritative

AI может:
- forecast;
- rank successors;
- suggest relation recipes;
- explain chains.

AI не должен:
- менять world state;
- строить без YES;
- расходовать card;
- обходить game rules.

## Relation-engine — основной reusable успех Meta6

Хранить relation state отдельно от objects.

Это позволяет потом добавлять:
- intensity;
- capacity;
- path;
- health;
- timers;
- delayed events;
- secondary spawns.

## Следующая хорошая цель

Не «ещё больше красивых линий».

Нужна первая настоящая многошаговая цепочка:

    farm + river
    -> irrigation relation
    -> water flows
    -> farm output rises over time
    -> cart appears
    -> cart travels to market
    -> market grows
    -> new successor card appears

Если игрок видит все эти стадии — это настоящий рост Chain Reaction.

## Evidence first

Любой новый claim должен иметь proof:

- exact SHA;
- public URL;
- browser/device;
- concrete interaction;
- expected vs actual;
- no-regression result.

## Physical iPhone has priority

Synthetic mobile browser полезен, но окончательный mobile UX gate — физический iPhone.

## Versioning rule

Рабочую успешную версию не переписывать рискованно.

Если изменение крупное:
- новая ветка;
- лучше отдельная MVP version;
- старый public link сохранить;
- после proof — переносить learning обратно в World Server.

## Главный критерий качества

Пользователь должен **увидеть причинность** без чтения документации.
