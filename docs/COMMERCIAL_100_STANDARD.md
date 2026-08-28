# COMMERCIAL 100 — стандарт продуктовых экспериментов World_server

## Главное правило

**Коммерческий score никогда не блокирует публикацию/релиз эксперимента.**
Нам нужны разные главные, разные офферы и быстрые тесты.

Разделяем два действия:

1. **RELEASE / TEST** — разрешён при любом коммерческом score.
2. **PROMOTE TO PRIMARY** — упаковка должна стремиться к `100/100`; объявлять вариант победителем можно только по реальным сравнительным данным.

## История главных — append-only

- Новая главная создаётся как отдельный вариант.
- Предыдущая главная не удаляется и не перезаписывается.
- При смене primary предыдущая получает `status=library`.
- Исходный путь, профиль, метрики и ledger остаются.
- Запрещено использовать `rm/unlink/rmdir` в менеджере главных.

## Две шкалы 100/100

### User-facing / `surface`
Рынок 15 + retention 15 + сила желания 12 + ясность 10 + first WOW 10 +
дифференциация 10 + сила демо-креатива 10 + виральность 8 + монетизация 6 +
надёжность 4 = 100.

### Engine / infrastructure / `platform`
Коммерческий эффект 20 + переиспользование 15 + ускорение WOW 15 +
надёжность 15 + измеримость 10 + скорость экспериментов 10 + стоимость/scale 10 +
non-destructive совместимость 5 = 100.

Таким образом внутренняя технология тоже обязана отвечать на вопрос:
**какую коммерческую метрику она улучшает?**

## First WOW contract

Цель:
- первый сильный визуальный результат <= 90 секунд;
- ориентир: 3–5 вопросов до первого результата;
- обязательная авторизация до первого WOW запрещена как стандарт продукта;
- дальнейшие вопросы — progressive disclosure;
- после первого мира должен быть понятный CTA к следующему ценному действию;
- для merge-концепции — CTA соединить мир с другим человеком;
- должен существовать return loop / Living World;
- должна измеряться полная воронка.

Это цели для продуктовых поверхностей, а не причина удалить эксперимент, который им пока не соответствует.

## Полная воронка

`VIEW -> START -> FIRST_ANSWER -> FIRST_WORLD -> INVITE -> SECOND_START -> MERGE -> PAY -> D1 -> D7`

Нельзя объявлять conversion/retention успешными без реальных событий.

## Команды

```bash
npm run commercial:validate
npm run commercial:report
npm run commercial:audit
node scripts/home-experiment-manager.js add <id> <path> "Title"
node scripts/home-experiment-manager.js activate <id>
node scripts/home-experiment-manager.js library <id>
node scripts/home-experiment-manager.js promote <id>
node scripts/home-experiment-manager.js list
node scripts/home-experiment-manager.js history [id]
node scripts/commercial-score.js <id>
node scripts/commercial-promotion-check.js <id>
```

`commercial:audit` всегда advisory и не должен ломать релиз из-за score/evidence.

## Что значит 100

`100/100` — **100 по нашему стандарту упаковки**, а не обещание коммерческого успеха.
Реальный рынок доказывают только тесты и метрики.
