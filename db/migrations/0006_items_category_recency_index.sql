CREATE INDEX IF NOT EXISTS idx_items_user_category_created_at
  ON items (user_id, category_id, created_at DESC, id DESC);
