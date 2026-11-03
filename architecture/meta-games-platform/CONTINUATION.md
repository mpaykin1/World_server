# META GAMES — продолжение

Сначала прочитай `STATE.json`, `NEXT_TASK.md`, `ASSET_INDEX.json`, `DEPLOYMENTS.json`, затем **актуальные** GitHub PR/HEAD/CI; не начинай с проектирования и не создавай дубли.

1. World_server PR #563 (merge `3a371abb08c5435d13ca4ec928da306f366afa7f`) — проверяемый каталог исходников 4 игр и 6 кандидатов, **ноль** свободно распространяемых компонентов (лицензии неизвестны).
2. World_server PR #564 (merge `246868e61d41f328f4bfe047422e269ea92d09be`) — один канонический read-only MCP HTTP transport, две реальные операции `list_games`, `inspect_game`. GitHub Actions на точном HEAD успешны; **сервис пока не развёрнут**.
3. meta6 PR #260 (merge `9bad465e3c27d68cf87111ac06c12972bcced3ce`) — новый анимированный независимый игровой портал `meta-games/index.html` с четырьмя прямыми ссылками на игры в том же GitHub Pages проекте. HTML/наличие файлов проверены GitHub Actions, **HTTP-ответ GitHub Pages ещё не проверен**.
4. World_server PR #565 (ветка `ai/chatgpt/meta-games-netlify-20261103`) — изолированные Netlify-маршруты для того же MCP. Тест адаптера прошёл, однако Netlify preview **failure** и его диагностические логи текущим подключением недоступны. **Не сливать до исправления.** Следующий шаг исключительно из NEXT_TASK.md.
5. Cloudflare Free API code `10037` — лимит 100 Workers. Vercel Hobby запрещён для коммерческого использования. Не использовать платные тарифы. Пять автозадач не менять, цель семи движков главная, принятые игры/stand/V5–V7 не редактировать.
