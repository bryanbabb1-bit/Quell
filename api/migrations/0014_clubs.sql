-- 0014 — clubs + the network flag (UX_CLUB_NETWORK_STRATEGY.md item A1).
--
-- A club is the entity Foretera SELLS TO. Every course belongs to a club; a
-- club is either a paying 'network' member or an unclaimed 'prospect'. This
-- one flag drives the join-the-network prompt (A2), the branded board + club
-- leaderboard (A3), and the claim path (A4). courses.club_id has existed since
-- 0002 ("clubs land in Phase 4") — this is Phase 4.
--
-- ⚠️ Apply remote via `wrangler d1 execute match-play --remote --file=...`
-- (the remote migration tracker is out of sync; never `migrations apply --remote`).

CREATE TABLE IF NOT EXISTS clubs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  crest_url     TEXT,            -- club crest for the branded board (A3)
  primary_color TEXT,            -- club accent for the branded board (A3)
  contact_email TEXT,            -- where the "ask your pro" prompt routes (A2/A4)
  contact_name  TEXT,
  status        TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('network','prospect')),
  joined_at     TEXT,            -- when they became a network club
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_club ON courses(club_id);

-- Backfill: one prospect club per course (1:1 today — multi-course clubs merge
-- later by repointing courses.club_id). Club id mirrors the course id
-- (course_api_10516 -> club_api_10516).
INSERT OR IGNORE INTO clubs (id, name, status, created_at, updated_at)
SELECT REPLACE(c.id, 'course_', 'club_'), c.name, 'prospect',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM courses c
 WHERE c.club_id IS NULL;

UPDATE courses SET club_id = REPLACE(id, 'course_', 'club_') WHERE club_id IS NULL;

-- Demo network member: Bryan's home club, so the gold "Foretera Club" badge is
-- visible on his board (the sales-demo artifact).
UPDATE clubs
   SET status = 'network',
       joined_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id IN (SELECT club_id FROM courses WHERE name = 'Prairie Highlands Golf Course');
