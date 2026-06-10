-- 0010 — GIF messages. A message is either text (body) or a GIF (gif_url, a
-- Giphy CDN url). gif_url is null for plain text messages.
ALTER TABLE messages ADD COLUMN gif_url TEXT;
