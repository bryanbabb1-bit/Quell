-- SAMPLE course seed — lets the engine run end-to-end before real course data
-- is entered. NOT real Prairie Highlands data. Replace with verified Prairie
-- card values (par + stroke index per tee, Course Rating, Slope) before play.
-- See docs/PUNCHLIST.md. Idempotent via INSERT OR IGNORE + fixed ids.

INSERT OR IGNORE INTO courses (id, name, city, state, created_at)
VALUES ('course_sample', 'Sample Links (PLACEHOLDER)', 'Olathe', 'KS', '2026-06-08T00:00:00.000Z');

INSERT OR IGNORE INTO tees
  (id, course_id, name, gender, course_rating, slope_rating, par,
   front_course_rating, front_slope_rating, front_par,
   back_course_rating, back_slope_rating, back_par)
VALUES ('tee_sample_blue', 'course_sample', 'Blue', 'M', 71.5, 130, 72,
   35.7, 128, 36,
   35.8, 132, 36);

-- 18 holes: pars sum to 72; stroke_index is a complete 1..18 (odds front, evens back).
INSERT OR IGNORE INTO holes (id, tee_id, hole_number, par, stroke_index) VALUES
 ('h_smpl_01','tee_sample_blue', 1, 4,  7),
 ('h_smpl_02','tee_sample_blue', 2, 4,  5),
 ('h_smpl_03','tee_sample_blue', 3, 5,  3),
 ('h_smpl_04','tee_sample_blue', 4, 3, 17),
 ('h_smpl_05','tee_sample_blue', 5, 4,  1),
 ('h_smpl_06','tee_sample_blue', 6, 4, 11),
 ('h_smpl_07','tee_sample_blue', 7, 3, 15),
 ('h_smpl_08','tee_sample_blue', 8, 5,  9),
 ('h_smpl_09','tee_sample_blue', 9, 4, 13),
 ('h_smpl_10','tee_sample_blue',10, 4,  8),
 ('h_smpl_11','tee_sample_blue',11, 3, 18),
 ('h_smpl_12','tee_sample_blue',12, 4,  4),
 ('h_smpl_13','tee_sample_blue',13, 5,  2),
 ('h_smpl_14','tee_sample_blue',14, 4, 10),
 ('h_smpl_15','tee_sample_blue',15, 4,  6),
 ('h_smpl_16','tee_sample_blue',16, 3, 16),
 ('h_smpl_17','tee_sample_blue',17, 5, 12),
 ('h_smpl_18','tee_sample_blue',18, 4, 14);
