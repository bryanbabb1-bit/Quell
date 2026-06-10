-- demo_photos.sql — give the seeded demo users portrait photos so the full-bleed
-- Discovery cards show faces. Uses pravatar (deterministic by the user's number).
-- Re-run safely: only fills users that don't already have a photo.
UPDATE users
   SET profile_photo_url = 'https://i.pravatar.cc/600?img=' || CAST(substr(id, 11) AS INTEGER)
 WHERE id LIKE 'user_demo_%'
   AND (profile_photo_url IS NULL OR profile_photo_url = '');
