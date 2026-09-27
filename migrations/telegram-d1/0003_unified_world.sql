-- One canonical D1 world for Telegram and anonymous browsers.
-- Browser tokens are stored only as SHA-256 digests; a code is redeemable once.
CREATE TABLE IF NOT EXISTS chain_browser_tokens (
  token_hash TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS chain_browser_tokens_chat ON chain_browser_tokens(chat_id);
CREATE TABLE IF NOT EXISTS chain_link_codes (
  code TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chain_link_codes_expiry ON chain_link_codes(expires_at);
