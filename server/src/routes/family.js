import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { familyBoard, setFamilyGoal } from '../lib/board.js';

// The family board (Home → Familie / Family): this week only, every account shown on it; the admin sets the family goal.
export function familyRoutes(ctx) {
  const { db } = ctx;
  const r = Router();

  r.get('/family', requireAuth(db), (req, res) => {
    res.json(familyBoard(db, { viewerId: req.user.id }));
  });

  // body { goal }: the family's XP target per week (50–10,000)
  r.put('/admin/family', requireAuth(db), requireAdmin, (req, res) => {
    const out = setFamilyGoal(db, req.body?.goal, req.user.username);
    if (out.error) return res.status(400).json({ error: out.error });
    req.log?.info({ goal: out.goal, by: req.user.username }, 'family goal set');
    return res.json(familyBoard(db, { viewerId: req.user.id }));
  });

  return r;
}
