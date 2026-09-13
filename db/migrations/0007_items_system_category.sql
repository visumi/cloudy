ALTER TABLE items ADD COLUMN system_category TEXT
  CHECK (system_category IS NULL OR system_category IN ('integrations'));

CREATE INDEX IF NOT EXISTS idx_items_user_system_category_created_at
  ON items (user_id, system_category, created_at DESC, id DESC);
