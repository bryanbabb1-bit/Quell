-- Point the seeded demo matches at the REAL imported course names so the
-- home-course default (filter by course_name) surfaces them. Tee stays the
-- sample tee for scoring; only the display name is aligned.
UPDATE matches SET course_name='Prairie Highlands Golf Course'        WHERE course_name='Prairie Highlands';
UPDATE matches SET course_name='Ironhorse Golf Club'                  WHERE course_name='Ironhorse';
UPDATE matches SET course_name='Falcon Ridge Golf Club'              WHERE course_name='Falcon Ridge';
UPDATE matches SET course_name='Sycamore Ridge Golf Club'            WHERE course_name='Sycamore Ridge';
UPDATE matches SET course_name='Shadow Glen Golf Club'              WHERE course_name='Shadow Glen';
UPDATE matches SET course_name='Deer Creek Golf Club'              WHERE course_name='Deer Creek';
UPDATE matches SET course_name='Tomahawk Hills Golf Course'        WHERE course_name='Tomahawk Hills';
UPDATE matches SET course_name='Canyon Farms Golf Club'            WHERE course_name='Canyon Farms';
UPDATE matches SET course_name='The National Golf Club Of Kansas City' WHERE course_name='The National';
