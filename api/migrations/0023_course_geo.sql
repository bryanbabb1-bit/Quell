-- 0023 — course coordinates, so the app can detect "what course am I at" from GPS
-- and find nearby games. Backfilled from GolfCourseAPI (which returns lat/lng we
-- previously dropped on import). Index supports the bounding-box nearest query.
ALTER TABLE courses ADD COLUMN latitude REAL;
ALTER TABLE courses ADD COLUMN longitude REAL;
CREATE INDEX IF NOT EXISTS idx_courses_geo ON courses(latitude, longitude);
