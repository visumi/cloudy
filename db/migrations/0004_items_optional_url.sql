CREATE TABLE items_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  favicon_url TEXT,
  observation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

INSERT INTO items_new (id, user_id, category_id, name, url, image_url, favicon_url, observation, created_at, updated_at)
  SELECT id, user_id, category_id, name, url, image_url, favicon_url, observation, created_at, updated_at
  FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX IF NOT EXISTS idx_items_user_created_at
  ON items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_user_category
  ON items (user_id, category_id);
