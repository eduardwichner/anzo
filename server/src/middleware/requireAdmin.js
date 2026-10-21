/** 403 unless req.user (set by requireAuth) is an admin who has replaced a seeded/reset password. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  if (req.user.must_change_password) return res.status(403).json({ error: 'must_change_password' });
  next();
}
