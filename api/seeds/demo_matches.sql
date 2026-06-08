-- demo_matches.sql — 10 fake members + 10 OPEN matches so the discovery/swipe
-- feed has content without hand-creating each. NOT real users. All matches use
-- the seeded sample tee (tee_sample_blue) so the engine can still settle one if
-- accepted, and use a wide handicap window (0..40) so they show for any tester.
-- Idempotent: INSERT OR IGNORE + fixed ids. Safe to re-run. Future play dates.
--
-- Apply (remote): npx wrangler d1 execute match-play --remote --file=seeds/demo_matches.sql
-- Remove later:    DELETE FROM matches WHERE id LIKE 'm_demo_%';
--                  DELETE FROM users   WHERE id LIKE 'user_demo_%';

INSERT OR IGNORE INTO users (id, email, first_name, last_name, ghin_number, handicap, created_at, updated_at) VALUES
 ('user_demo_01','marcus.bennett@example.com','Marcus','Bennett','1234501', 8.2,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_02','diego.alvarez@example.com','Diego','Alvarez','1234502',14.6,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_03','ryan.oconnell@example.com','Ryan','O''Connell','1234503', 4.1,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_04','tyler.kim@example.com','Tyler','Kim','1234504',19.3,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_05','sam.whitfield@example.com','Sam','Whitfield','1234505',11.0,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_06','andre.boudreaux@example.com','Andre','Boudreaux','1234506', 2.7,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_07','priya.natarajan@example.com','Priya','Natarajan','1234507',16.8,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_08','logan.pierce@example.com','Logan','Pierce','1234508', 9.5,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_09','hector.ramos@example.com','Hector','Ramos','1234509',22.4,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('user_demo_10','will.hartman@example.com','Will','Hartman','1234510', 6.3,'2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z');

INSERT OR IGNORE INTO matches
 (id, creator_id, status, course_name, tee_color, tee_id, play_date, play_time, match_type, stakes, hcp_range_min, hcp_range_max, created_at, updated_at) VALUES
 ('m_demo_01','user_demo_01','open','Prairie Highlands','Blue', 'tee_sample_blue','2026-06-11','08:30','eighteen',  20,0,40,'2026-06-08T12:00:00.000Z','2026-06-08T12:00:00.000Z'),
 ('m_demo_02','user_demo_02','open','Falcon Ridge','White',     'tee_sample_blue','2026-06-12','10:00','front_nine',NULL,0,40,'2026-06-08T12:01:00.000Z','2026-06-08T12:01:00.000Z'),
 ('m_demo_03','user_demo_03','open','Ironhorse','Black',        'tee_sample_blue','2026-06-13','07:15','eighteen',  50,0,40,'2026-06-08T12:02:00.000Z','2026-06-08T12:02:00.000Z'),
 ('m_demo_04','user_demo_04','open','Sycamore Ridge','White',   'tee_sample_blue','2026-06-13','13:45','back_nine', NULL,0,40,'2026-06-08T12:03:00.000Z','2026-06-08T12:03:00.000Z'),
 ('m_demo_05','user_demo_05','open','Tomahawk Hills','Blue',    'tee_sample_blue','2026-06-14','09:00','eighteen',  10,0,40,'2026-06-08T12:04:00.000Z','2026-06-08T12:04:00.000Z'),
 ('m_demo_06','user_demo_06','open','Shadow Glen','Black',      'tee_sample_blue','2026-06-15','06:50','eighteen', 100,0,40,'2026-06-08T12:05:00.000Z','2026-06-08T12:05:00.000Z'),
 ('m_demo_07','user_demo_07','open','Deer Creek','White',       'tee_sample_blue','2026-06-16','11:20','front_nine',NULL,0,40,'2026-06-08T12:06:00.000Z','2026-06-08T12:06:00.000Z'),
 ('m_demo_08','user_demo_08','open','The National','Blue',      'tee_sample_blue','2026-06-18','08:00','eighteen',  25,0,40,'2026-06-08T12:07:00.000Z','2026-06-08T12:07:00.000Z'),
 ('m_demo_09','user_demo_09','open','Canyon Farms','White',     'tee_sample_blue','2026-06-20','15:00','back_nine',   5,0,40,'2026-06-08T12:08:00.000Z','2026-06-08T12:08:00.000Z'),
 ('m_demo_10','user_demo_10','open','Prairie Highlands','Black','tee_sample_blue','2026-06-21','07:40','eighteen',  40,0,40,'2026-06-08T12:09:00.000Z','2026-06-08T12:09:00.000Z');
