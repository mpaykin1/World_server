# HOME EXPERIMENT TEMPLATE

Каждая новая главная создаётся отдельно и не заменяет предыдущую физически.

Минимально заполнить:
- Audience
- One desire/problem
- Promise in <= 3 seconds
- Primary CTA
- First WOW
- Why this is different
- Invite/viral loop
- Return/Living World loop
- Monetization hypothesis
- Reliability/mobile plan
- Analytics event map

После создания зарегистрировать:
```bash
node scripts/home-experiment-manager.js add <id> <path> "Название гипотезы"
```

После публикации:
```bash
node scripts/home-experiment-manager.js activate <id>
```

Старый вариант переносится в библиотеку **без удаления**:
```bash
node scripts/home-experiment-manager.js library <id>
```

Если новый становится основной главной:
```bash
node scripts/home-experiment-manager.js promote <id>
```
