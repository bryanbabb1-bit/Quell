-- 0004 — per-nine WHS ratings so front/back-9 matches handicap correctly.
-- A nine has its own Course Rating, Slope, and par; the engine uses these (with
-- the half/9-hole Handicap Index) instead of rescaling the 18-hole difference.
-- Nullable: when absent, the engine falls back to deriving a nine from the
-- 18-hole tee (half par/rating, same slope).
ALTER TABLE tees ADD COLUMN front_course_rating REAL;
ALTER TABLE tees ADD COLUMN front_slope_rating INTEGER;
ALTER TABLE tees ADD COLUMN front_par INTEGER;
ALTER TABLE tees ADD COLUMN back_course_rating REAL;
ALTER TABLE tees ADD COLUMN back_slope_rating INTEGER;
ALTER TABLE tees ADD COLUMN back_par INTEGER;
