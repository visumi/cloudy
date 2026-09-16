CREATE TABLE IF NOT EXISTS discord_connections (
  discord_user_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  shortcut_token_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shortcut_token_id) REFERENCES shortcut_tokens(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discord_connections_token
  ON discord_connections (shortcut_token_id);
