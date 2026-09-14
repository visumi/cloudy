PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shares_owner_created_at
  ON shares (owner_user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS share_categories (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_categories_share_position
  ON share_categories (share_id, position, id);

CREATE TABLE IF NOT EXISTS share_items (
  id TEXT PRIMARY KEY,
  share_category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  favicon_url TEXT,
  observation TEXT,
  position INTEGER NOT NULL,
  FOREIGN KEY (share_category_id) REFERENCES share_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_share_items_category_position
  ON share_items (share_category_id, position, id);
