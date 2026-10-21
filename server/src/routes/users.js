import { Router } from 'express';
import { listLoginProfiles } from '../lib/users.js';

// Public: the login grid shows one avatar card per account marked "shown on the login screen".
export function userRoutes({ db }) {
  const r = Router();
  r.get('/users/profiles', (req, res) => {
    res.json({ profiles: listLoginProfiles(db) });
  });
  return r;
}
