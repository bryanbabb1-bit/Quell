-- Expo push token per user, so the worker can notify the other player when a
-- scorecard is submitted (opponent's turn) or the match settles (result ready).
ALTER TABLE users ADD COLUMN expo_push_token TEXT;
