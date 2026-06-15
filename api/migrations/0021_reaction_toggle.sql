-- 0021 — reactions become a toggle. Today every tap inserts a row, so counts
-- only climb and nobody can un-react. Make it one reaction per (match, user,
-- kind): dedupe any existing duplicate taps (keep one per group), then enforce
-- uniqueness so a second tap removes instead of stacking. Count per kind then
-- equals the number of distinct people who reacted — which is what we want.
DELETE FROM match_reactions
 WHERE id NOT IN (
   SELECT MIN(id) FROM match_reactions GROUP BY match_id, user_id, kind
 );

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_reactions_unique
  ON match_reactions(match_id, user_id, kind);
