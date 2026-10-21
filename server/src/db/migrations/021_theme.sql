-- Settings → Theme: 'system' follows the device (prefers-color-scheme), 'light' or 'dark' fixes it.
-- Per account; the client mirrors it on the device (localStorage 'anzo.theme') so it applies before the first paint.
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark'));
