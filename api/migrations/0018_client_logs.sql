-- 0018 — client error log. The app forwards uncaught errors + console.error
-- (incl. React Native render warnings like "Text strings must be rendered
-- within a <Text>") here, so "go look at the logs" is a single D1 query:
--   wrangler d1 execute match-play --remote --command \
--     "SELECT created_at, level, context, message FROM client_logs ORDER BY created_at DESC LIMIT 30"
--
-- ⚠️ Apply remote via `wrangler d1 execute match-play --remote --file=...`.

CREATE TABLE IF NOT EXISTS client_logs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,            -- who hit it (nullable for pre-auth)
  level      TEXT NOT NULL,   -- 'error' | 'fatal' | 'console'
  message    TEXT NOT NULL,
  stack      TEXT,
  context    TEXT,            -- screen/route or 'global' / 'console.error'
  platform   TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_logs_recent ON client_logs(created_at);
