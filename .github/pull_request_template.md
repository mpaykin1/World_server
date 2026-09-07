## Что изменено

- 

## Какие файлы

- 

## Тесты / evidence

- [ ] `npm run check` или эквивалентные целевые проверки выполнены
- [ ] Известные ошибки/ограничения перечислены ниже

## Принцип ВНО — обязательно

**ВНО = Воспроизводимость, Независимость, Опровержение.**
Permanent North Star: **100% reproducibility + 100% independence + 100% falsification**.

- Влияет ли PR на эксперименты, simulation/world rules, gameplay, resilience/repair, scientific claims, evidence, agent reasoning или quality measurements? `YES / NO`
- `REPRODUCIBILITY`: `improves / preserved / regresses` — почему?
- `INDEPENDENCE`: `improves / preserved / regresses` — почему?
- `FALSIFICATION`: `improves / preserved / regresses` — почему?
- Какой из трёх столпов сейчас самый слабый и помогает ли PR его усилить?
- Если это scientific PR: какой текущий `EVIDENCE_LEVEL (D0-D7)`?
- Если это scientific PR: отделено ли `CODE_EXPERIMENT_CONFIRMATION` от `SCIENCE_READINESS`?
- Если это scientific PR: есть ли preregistration/freeze/hidden holdout, сильные controls/ablations, adversarial or counterexample tests и сохранение negative results?
- Если это scientific PR: что должен попытаться опровергнуть независимый Red Team Scientist?

### Если открытие переносится в gameplay

- [ ] Есть `science/vno/RUN_###.vno.json` или обновлена соответствующая VNO-запись.
- [ ] Проверены **все** системы из `data/vno-gameplay-systems.json`.
- [ ] Для каждой системы честно указано `APPLICABLE` или `NOT_APPLICABLE` с причиной.
- [ ] Для каждого `APPLICABLE` есть конкретная фича, baseline, code-test plan и falsification attack.
- [ ] Игроку это объясняется простыми русскими словами уровня 5 лет, без выдачи идеи/preview за доказанный результат.
- [ ] Успех одной системы не используется как автоматическое доказательство другой.
- [ ] Production activation по-прежнему проходит существующие `docs/SCIENCE_GAMEPLAY_STANDARD.md` gates.
- [ ] После цикла добавлено хотя бы одно честное улучшение метода/проверки или сохранён информативный отрицательный результат.
- [ ] Следующий цикл возвращается к шагу 1 и переносит нерешённые VNO blockers дальше.

**Запрещено:** выдавать `pass:true` как доказанный закон реального мира, менять confirmation thresholds после просмотра holdout, скрывать `pass:false`, использовать self-certification как единственное доказательство, повышать VNO-процент изменением правил подсчёта вместо усиления evidence.

Полный научный стандарт: `SCIENCE_STANDARD.md`; машинная политика: `.ai/science-governance.json`; цикл ВНО: `.ai/vno-cycle.json`.

## Локальный компьютер / cloud-first

- [ ] Работа выполнена cloud/browser-first там, где это возможно.
- [ ] Локальные агенты не создавали мусор на Desktop и не запускали ненужную тяжёлую работу.
- [ ] Временные session-owned артефакты очищены; замедление компьютера считается регрессией.

## Известные проблемы / blockers

- 

## Следующий шаг

- 
