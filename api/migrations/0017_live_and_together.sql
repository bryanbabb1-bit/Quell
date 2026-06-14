-- 0017 — Live & Together: playing-together flag + match followers.
--
-- The app supports playing WITH someone (same group) or APART (the novel
-- premise). `playing_together` records which — and it's the gate for LIVE
-- scoring: two players in the same group already see each other's cards, so
-- live scoring + spectators spoil nothing. Apart matches keep the sealed
-- hidden-card reveal. `match_followers` powers the 👁 watcher count.
--
-- ⚠️ Apply remote via `wrangler d1 execute match-play --remote --file=...`
-- (remote migration tracker is out of sync; never `migrations apply --remote`).

ALTER TABLE matches ADD COLUMN playing_together INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS match_followers (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL,   -- -> matches.id
  user_id    TEXT NOT NULL,   -- -> users.id
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_match_followers_unique ON match_followers(match_id, user_id);
CREATE INDEX IF NOT EXISTS idx_match_followers_match ON match_followers(match_id);
