-- Play words automatically (Settings): target-language questions and listening exercises are read aloud once when they
-- appear. Per account (before 010: a per-device switch in the lesson header). Default on; manual 🔊 / 🐢 always work.
ALTER TABLE users ADD COLUMN autoplay INTEGER NOT NULL DEFAULT 1;
