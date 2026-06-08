-- 0001_init.sql — Match Play core schema (D1 / SQLite).
--
-- FK enforcement is OFF by default in D1, so relationships are documented in
-- comments and backed by indexes rather than enforced REFERENCES (this also
-- avoids the circular matches<->scorecards dependency). Cascade deletes are
-- handled explicitly in application code (see handleDeleteMe pattern).
--
-- All ids are app-generated hex (lib/id.ts) EXCEPT users.id, which is the
-- Clerk user id (the JWT `sub` claim). Timestamps are ISO-8601 strings.

CREATE TABLE users (
  id                TEXT PRIMARY KEY,   -- Clerk user id (sub)
  email             TEXT NOT NULL,
  first_name        TEXT,
  last_name         TEXT,
  handicap          REAL,               -- manual GHIN entry in V1
  profile_photo_url TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  creator_id    TEXT NOT NULL,          -- -> users.id
  opponent_id   TEXT,                   -- -> users.id; NULL until accepted
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','accepted','in_progress','completed','declined','cancelled')),
  course_name   TEXT NOT NULL,
  tee_color     TEXT NOT NULL,
  play_date     TEXT NOT NULL,          -- YYYY-MM-DD
  play_time     TEXT,                   -- HH:MM (nullable)
  match_type    TEXT NOT NULL
                  CHECK (match_type IN ('front_nine','back_nine','eighteen')),
  stakes        REAL,                   -- DISPLAY ONLY — never processed
  hcp_range_min INTEGER NOT NULL,       -- creator's +/- floor
  hcp_range_max INTEGER NOT NULL,       -- creator's +/- ceiling

  creator_scorecard_id  TEXT,           -- -> scorecards.id
  opponent_scorecard_id TEXT,           -- -> scorecards.id

  -- Handicaps snapshotted at ACCEPTANCE so a later handicap change can't
  -- retroactively alter a completed match.
  creator_handicap  REAL,
  opponent_handicap REAL,

  result            TEXT CHECK (result IN ('creator_wins','opponent_wins','tie')),
  match_progression TEXT,               -- JSON: hole-by-hole deltas for the reveal

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE TABLE scorecards (
  id           TEXT PRIMARY KEY,
  match_id     TEXT NOT NULL,           -- -> matches.id
  player_id    TEXT NOT NULL,           -- -> users.id
  photo_url    TEXT NOT NULL,
  parsed_data  TEXT,                    -- JSON: gross per hole + raw OCR
  net_scores   TEXT,                    -- JSON: computed net per hole
  confidence   REAL,                    -- OCR confidence; low -> manual review
  submitted_at TEXT NOT NULL,
  verified_at  TEXT                     -- set after server validation
);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL,             -- -> matches.id
  sender_id  TEXT NOT NULL,             -- -> users.id
  body       TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Discovery feed: open matches by date. Compatibility (handicap range) is
-- filtered in the query; this index keeps the base scan cheap.
CREATE INDEX idx_matches_status_date ON matches(status, play_date);
CREATE INDEX idx_matches_creator     ON matches(creator_id);
CREATE INDEX idx_matches_opponent    ON matches(opponent_id);
CREATE INDEX idx_scorecards_match    ON scorecards(match_id);
CREATE INDEX idx_messages_match      ON messages(match_id, created_at);
