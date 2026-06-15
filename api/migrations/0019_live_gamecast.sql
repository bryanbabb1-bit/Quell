-- 0019 — live gamecast: end-of-round confirmation + spectator reactions.
--
-- Same-group live matches no longer auto-settle the instant both cards are full;
-- each player CONFIRMS the final card first (one person may have kept both
-- sides, so the other attests). Both confirmed → settle → reveal. match_reactions
-- powers the lightweight spectator "cheers".
--
-- ⚠️ Apply remote via `wrangler d1 execute match-play --remote --file=...`.

ALTER TABLE matches ADD COLUMN creator_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN opponent_confirmed INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS match_reactions (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL,   -- -> matches.id
  user_id    TEXT NOT NULL,   -- -> users.id
  kind       TEXT NOT NULL,   -- 'fire' | 'clap' | 'flag' | 'shock'
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_reactions_match ON match_reactions(match_id, created_at);
