-- 004_start_pack: the level (pack id) a child starts at. NULL = the track's first available pack.
-- Lessons of earlier packs stay playable but optional; the path unlocks from the first lesson of this pack.
ALTER TABLE users ADD COLUMN start_pack TEXT NULL;
