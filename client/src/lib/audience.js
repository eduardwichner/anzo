// users.audience: adults get adult wording in the few texts that address a child. Mirrors messageKey in
// server/src/ops/reports.js (the server writes these messages when the admin sends the default text).
export const messageKey = (kind, audience) => `messages.${kind}${audience === 'adult' ? 'Adult' : ''}`;
