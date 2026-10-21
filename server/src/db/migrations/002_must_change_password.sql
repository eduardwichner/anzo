-- 002: force a password change before an admin can use the admin pages.
-- Set at seed time for `admin` and whenever an admin resets someone's password; cleared by a
-- successful self-service change. Only enforced for role 'admin' (children keep simple passwords).
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1));

-- Existing installations: admins created by the seed still have the seeded password.
UPDATE users SET must_change_password = 1 WHERE role = 'admin';
