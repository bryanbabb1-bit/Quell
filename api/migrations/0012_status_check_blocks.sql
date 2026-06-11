-- 0012 — three things:
--
-- 1. REBUILD matches to fix the status CHECK. The original CHECK only allowed
--    the six launch statuses; 'pending' (direct challenges, round 0007-era) and
--    'expired' (forfeit cron, 0008) were added in code but never to the
--    constraint — so EVERY direct-challenge INSERT and every cron expire UPDATE
--    has been failing with SQLITE_CONSTRAINT_CHECK. SQLite can't ALTER a CHECK,
--    hence the rebuild. Also adds nudge_last_sent_at (nudge cooldown).
--
-- 2. blocks — user A hides user B (and vice versa) from discovery/feed/
--    challenges. App Store Guideline 1.2 requires a block mechanism.
--
-- 3. reports — abuse reports for review (no automated action yet).

CREATE TABLE matches_new (
  id            TEXT PRIMARY KEY,
  creator_id    TEXT NOT NULL,          -- -> users.id
  opponent_id   TEXT,                   -- -> users.id; NULL until accepted
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','pending','accepted','in_progress','completed','declined','cancelled','expired')),
  course_name   TEXT NOT NULL,
  tee_color     TEXT NOT NULL,
  play_date     TEXT NOT NULL,          -- YYYY-MM-DD
  play_time     TEXT,                   -- HH:MM (nullable)
  match_type    TEXT NOT NULL
                  CHECK (match_type IN ('front_nine','back_nine','eighteen')),
  stakes        REAL,                   -- DISPLAY ONLY — never processed
  hcp_range_min INTEGER NOT NULL,
  hcp_range_max INTEGER NOT NULL,
  creator_scorecard_id  TEXT,
  opponent_scorecard_id TEXT,
  creator_handicap  REAL,
  opponent_handicap REAL,
  result            TEXT CHECK (result IN ('creator_wins','opponent_wins','tie')),
  match_progression TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT,
  tee_id TEXT,
  score_reminder_at TEXT,
  forfeit_warning_at TEXT,
  opponent_tee_id TEXT,
  opponent_tee_color TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  nudge_last_sent_at TEXT               -- cooldown stamp for POST /matches/:id/nudge
);

INSERT INTO matches_new
  (id, creator_id, opponent_id, status, course_name, tee_color, play_date, play_time,
   match_type, stakes, hcp_range_min, hcp_range_max, creator_scorecard_id, opponent_scorecard_id,
   creator_handicap, opponent_handicap, result, match_progression, created_at, updated_at,
   completed_at, tee_id, score_reminder_at, forfeit_warning_at, opponent_tee_id,
   opponent_tee_color, visibility)
SELECT
   id, creator_id, opponent_id, status, course_name, tee_color, play_date, play_time,
   match_type, stakes, hcp_range_min, hcp_range_max, creator_scorecard_id, opponent_scorecard_id,
   creator_handicap, opponent_handicap, result, match_progression, created_at, updated_at,
   completed_at, tee_id, score_reminder_at, forfeit_warning_at, opponent_tee_id,
   opponent_tee_color, visibility
FROM matches;

DROP TABLE matches;
ALTER TABLE matches_new RENAME TO matches;

CREATE INDEX idx_matches_status_date ON matches(status, play_date);
CREATE INDEX idx_matches_creator     ON matches(creator_id);
CREATE INDEX idx_matches_opponent    ON matches(opponent_id);
CREATE INDEX idx_matches_feed        ON matches(course_name, play_date, visibility);

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL,             -- -> users.id (who blocked)
  blocked_id TEXT NOT NULL,             -- -> users.id (who they blocked)
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_id);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL,            -- -> users.id
  reported_id TEXT NOT NULL,            -- -> users.id
  match_id    TEXT,                     -- optional context
  reason      TEXT NOT NULL,            -- 'spam' | 'abuse' | 'cheating' | 'other'
  detail      TEXT,                     -- free text (optional)
  created_at  TEXT NOT NULL
);
