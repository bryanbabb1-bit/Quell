-- Starred "common opponents" — one row per (user → favorite) direction.
CREATE TABLE IF NOT EXISTS favorites (
  user_id          TEXT NOT NULL,
  favorite_user_id TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, favorite_user_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites (user_id);
