-- relink_tees.sql — repair demo matches that point at the stand-in
-- `tee_sample_blue` (course_sample, which has only a "Blue" tee). Link each to a
-- REAL tee on its named course so the tee picker shows the full set. Idempotent.

-- 1) Exact tee-color match on the real course.
UPDATE matches SET tee_id = (
    SELECT t.id FROM tees t JOIN courses c ON c.id = t.course_id
     WHERE c.name = matches.course_name AND t.name = matches.tee_color LIMIT 1)
 WHERE tee_id = 'tee_sample_blue'
   AND EXISTS (SELECT 1 FROM tees t JOIN courses c ON c.id = t.course_id
                WHERE c.name = matches.course_name AND t.name = matches.tee_color);

-- 2) Color prefix (e.g. "Black" -> "Black (M)"); adopt the real tee's name.
UPDATE matches SET
    tee_color = (SELECT t.name FROM tees t JOIN courses c ON c.id = t.course_id
                  WHERE c.name = matches.course_name AND t.name LIKE matches.tee_color || '%'
                  ORDER BY t.course_rating DESC LIMIT 1),
    tee_id = (SELECT t.id FROM tees t JOIN courses c ON c.id = t.course_id
               WHERE c.name = matches.course_name AND t.name LIKE matches.tee_color || '%'
               ORDER BY t.course_rating DESC LIMIT 1)
 WHERE tee_id = 'tee_sample_blue'
   AND EXISTS (SELECT 1 FROM tees t JOIN courses c ON c.id = t.course_id
                WHERE c.name = matches.course_name AND t.name LIKE matches.tee_color || '%');

-- 3) Fallback: the tips (highest-rated tee) on that course.
UPDATE matches SET
    tee_color = (SELECT t.name FROM tees t JOIN courses c ON c.id = t.course_id
                  WHERE c.name = matches.course_name ORDER BY t.course_rating DESC LIMIT 1),
    tee_id = (SELECT t.id FROM tees t JOIN courses c ON c.id = t.course_id
               WHERE c.name = matches.course_name ORDER BY t.course_rating DESC LIMIT 1)
 WHERE tee_id = 'tee_sample_blue'
   AND EXISTS (SELECT 1 FROM tees t JOIN courses c ON c.id = t.course_id WHERE c.name = matches.course_name);

-- 4) Opponent tee: default to the (now real) creator tee where it was the stand-in.
UPDATE matches SET opponent_tee_id = tee_id, opponent_tee_color = tee_color
 WHERE opponent_tee_id = 'tee_sample_blue';
