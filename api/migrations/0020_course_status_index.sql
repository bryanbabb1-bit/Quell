-- 0020 — the highest-leverage index for the per-course aggregates.
--
-- The leaderboard (by course), monthly champions, the staff dashboard, and the
-- feed pulse all filter `matches` by (course_name, status) [+ a play_date range].
-- The existing idx_matches_feed leads on (course_name, play_date, visibility) and
-- idx_matches_status_date leads on (status, play_date) — neither gives a clean
-- (course_name, status) prefix, so those aggregates scan completed matches. This
-- composite makes them index-driven (course → status → play_date range).
--
-- Pure additive index; safe to apply live. ⚠️ Apply remote via
-- `wrangler d1 execute match-play --remote --file=...`.

CREATE INDEX IF NOT EXISTS idx_matches_course_status ON matches(course_name, status, play_date);
