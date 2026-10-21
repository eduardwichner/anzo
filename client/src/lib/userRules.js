// Client copy of the account rules in server/src/lib/users.js (a unit test keeps them equal).
// The server validates again; these only give immediate feedback in the forms.
export const USERNAME_RE = /^[a-z0-9_-]{2,24}$/;
export const DISPLAY_NAME_MAX = 30;
export const UI_LANGS = ['nl', 'en'];

export function minPasswordLength(role) {
  return role === 'admin' ? 8 : 4;
}
