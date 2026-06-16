-- 0022 — a club can publish ONE external link (website, tee-time booking, league
-- signup, etc.) that staff set in Club Control and members tap from the board.
ALTER TABLE clubs ADD COLUMN link_url TEXT;
