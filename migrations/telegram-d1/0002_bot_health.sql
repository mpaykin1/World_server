-- Cron-only state: no public request can call Telegram's Bot API to probe it.
CREATE TABLE IF NOT EXISTS telegram_bot_health (
  id INTEGER PRIMARY KEY CHECK(id=1),
  last_ok_at TEXT NOT NULL,
  bot_username TEXT NOT NULL,
  webhook_url TEXT NOT NULL
);
