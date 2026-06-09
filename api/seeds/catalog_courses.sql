-- catalog_courses.sql — a few REAL-NAMED courses with complete scorecards so the
-- create-match course/tee picker has content to choose from. ⚠️ The par layout
-- is a standard par-72 and the stroke index is a valid 1..18 STAND-IN — NOT the
-- verified card for each course. Replace per docs/COURSE_DATA.md once real public
-- data (GolfCourseAPI + USGA CR/Slope + printed SI) is imported.
-- Idempotent: INSERT OR IGNORE + fixed ids.
--
-- Apply (remote): npx wrangler d1 execute match-play --remote --file=seeds/catalog_courses.sql

INSERT OR IGNORE INTO courses (id, name, city, state, created_at) VALUES
 ('course_prairie',  'Prairie Highlands', 'Olathe',  'KS', '2026-06-09T00:00:00.000Z'),
 ('course_ironhorse','Ironhorse',         'Leawood', 'KS', '2026-06-09T00:00:00.000Z'),
 ('course_falcon',   'Falcon Ridge',      'Lenexa',  'KS', '2026-06-09T00:00:00.000Z');

INSERT OR IGNORE INTO tees
 (id, course_id, name, gender, course_rating, slope_rating, par,
  front_course_rating, front_slope_rating, front_par,
  back_course_rating, back_slope_rating, back_par) VALUES
 ('tee_prairie_blue',  'course_prairie',  'Blue',  'M', 71.2, 132, 72, 35.5, 130, 36, 35.7, 134, 36),
 ('tee_ironhorse_black','course_ironhorse','Black', 'M', 72.8, 138, 72, 36.3, 136, 36, 36.5, 140, 36),
 ('tee_falcon_white',  'course_falcon',   'White', 'M', 70.1, 126, 72, 34.9, 124, 36, 35.2, 128, 36);

-- Shared standard layout: par sums to 72; stroke index is a complete 1..18
-- (odds on the front, evens on the back).
INSERT OR IGNORE INTO holes (id, tee_id, hole_number, par, stroke_index) VALUES
 ('h_prh_01','tee_prairie_blue', 1,4, 7),('h_prh_02','tee_prairie_blue', 2,4, 5),('h_prh_03','tee_prairie_blue', 3,5, 3),
 ('h_prh_04','tee_prairie_blue', 4,3,17),('h_prh_05','tee_prairie_blue', 5,4, 1),('h_prh_06','tee_prairie_blue', 6,4,11),
 ('h_prh_07','tee_prairie_blue', 7,3,15),('h_prh_08','tee_prairie_blue', 8,5, 9),('h_prh_09','tee_prairie_blue', 9,4,13),
 ('h_prh_10','tee_prairie_blue',10,4, 8),('h_prh_11','tee_prairie_blue',11,5, 4),('h_prh_12','tee_prairie_blue',12,3,18),
 ('h_prh_13','tee_prairie_blue',13,4, 2),('h_prh_14','tee_prairie_blue',14,4,12),('h_prh_15','tee_prairie_blue',15,3,16),
 ('h_prh_16','tee_prairie_blue',16,5, 6),('h_prh_17','tee_prairie_blue',17,4,10),('h_prh_18','tee_prairie_blue',18,4,14),
 ('h_irn_01','tee_ironhorse_black', 1,4, 7),('h_irn_02','tee_ironhorse_black', 2,4, 5),('h_irn_03','tee_ironhorse_black', 3,5, 3),
 ('h_irn_04','tee_ironhorse_black', 4,3,17),('h_irn_05','tee_ironhorse_black', 5,4, 1),('h_irn_06','tee_ironhorse_black', 6,4,11),
 ('h_irn_07','tee_ironhorse_black', 7,3,15),('h_irn_08','tee_ironhorse_black', 8,5, 9),('h_irn_09','tee_ironhorse_black', 9,4,13),
 ('h_irn_10','tee_ironhorse_black',10,4, 8),('h_irn_11','tee_ironhorse_black',11,5, 4),('h_irn_12','tee_ironhorse_black',12,3,18),
 ('h_irn_13','tee_ironhorse_black',13,4, 2),('h_irn_14','tee_ironhorse_black',14,4,12),('h_irn_15','tee_ironhorse_black',15,3,16),
 ('h_irn_16','tee_ironhorse_black',16,5, 6),('h_irn_17','tee_ironhorse_black',17,4,10),('h_irn_18','tee_ironhorse_black',18,4,14),
 ('h_fal_01','tee_falcon_white', 1,4, 7),('h_fal_02','tee_falcon_white', 2,4, 5),('h_fal_03','tee_falcon_white', 3,5, 3),
 ('h_fal_04','tee_falcon_white', 4,3,17),('h_fal_05','tee_falcon_white', 5,4, 1),('h_fal_06','tee_falcon_white', 6,4,11),
 ('h_fal_07','tee_falcon_white', 7,3,15),('h_fal_08','tee_falcon_white', 8,5, 9),('h_fal_09','tee_falcon_white', 9,4,13),
 ('h_fal_10','tee_falcon_white',10,4, 8),('h_fal_11','tee_falcon_white',11,5, 4),('h_fal_12','tee_falcon_white',12,3,18),
 ('h_fal_13','tee_falcon_white',13,4, 2),('h_fal_14','tee_falcon_white',14,4,12),('h_fal_15','tee_falcon_white',15,3,16),
 ('h_fal_16','tee_falcon_white',16,5, 6),('h_fal_17','tee_falcon_white',17,4,10),('h_fal_18','tee_falcon_white',18,4,14);
