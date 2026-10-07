-- Persistent Telegram state is isolated from existing Supabase worlds.
CREATE TABLE IF NOT EXISTS telegram_sessions (
  chat_id TEXT PRIMARY KEY,
  world TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  restart INTEGER NOT NULL DEFAULT 0,
  pending_revision INTEGER,
  last_update_id INTEGER NOT NULL DEFAULT -1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS telegram_sessions_updated ON telegram_sessions(updated_at);
