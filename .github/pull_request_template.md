## Что изменено

- 

## Какие файлы

- 

## Тесты / evidence

- [ ] `npm run check` или эквивалентные целевые проверки выполнены
- [ ] Известные ошибки/ограничения перечислены ниже

## Science 100 impact — обязательно

Permanent North Star: **100% reproducibility + 100% independence + 100% falsification**.

- Влияет ли PR на эксперименты, simulation/world rules, resilience/repair, scientific claims, evidence, agent reasoning или quality measurements? `YES / NO`
- `REPRODUCIBILITY`: `improves / preserved / regresses` — почему?
- `INDEPENDENCE`: `improves / preserved / regresses` — почему?
- `FALSIFICATION`: `improves / preserved / regresses` — почему?
- Какой из трёх столпов сейчас самый слабый и помогает ли PR его усилить?
- Если это scientific PR: какой текущий `EVIDENCE_LEVEL (D0-D7)`?
- Если это scientific PR: отделено ли `CODE_EXPERIMENT_CONFIRMATION` от `SCIENCE_READINESS`?
- Если это scientific PR: есть ли preregistration/freeze/hidden holdout, сильные controls/ablations, adversarial or counterexample tests и сохранение negative results?
- Если это scientific PR: что должен попытаться опровергнуть независимый Red Team Scientist?

**Запрещено:** выдавать `pass:true` как доказанный закон реального мира, менять confirmation thresholds после просмотра holdout, скрывать `pass:false`, использовать self-certification как единственное доказательство.

Полный стандарт: `SCIENCE_STANDARD.md`; машинная политика: `.ai/science-governance.json`.

## Известные проблемы / blockers

- 

## Следующий шаг

- 
