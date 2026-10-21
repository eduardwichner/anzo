// The `why` notes of content/audio-overrides.json: one plain sentence written from an entry's own fields, the same way for
// every entry (npm run audio:fix, Record again, and any entry made by hand). A note never changes a clip: only the synthesis
// fields are part of a clip's file name (clipFile in server/src/audio/clips.js).

/** The `about` line of content/audio-overrides.json. */
export const ABOUT = 'Per-clip synthesis overrides (npm run audio:fix, Record again; docs/developer/audio.md). clips[track][text] = { say, '
  + 'carrier, lengthFactor, end, hiatus, take, why } for both speeds, or { normal: {…}, slow: {…}, … } per speed (noiseScale, noiseW '
  + 'and trim remain only on older entries). accepted[track][text] = { why, speeds? }: flags that are a limit of the check, not a fault. '
  + 'pins[track][text][speed] = { file, why }: a clip kept as it is — no lexicon, no carrier, never rendered again. Every why is '
  + 'written from the entry\'s own fields (scripts/render-audio/override-notes.js).';

/** A per-clip override: its fields in a fixed order. */
export function overrideNote(entry = {}) {
  const parts = [];
  if (entry.say !== undefined) parts.push(`said as "${entry.say}"`);
  if (entry.hiatus !== undefined) parts.push('with the fixed break at its hiatus comma');
  if (entry.carrier !== undefined) parts.push(`after the carrier "${entry.carrier}"`);
  if (entry.lengthFactor !== undefined) parts.push(`length × ${entry.lengthFactor}`);
  if (entry.end === 'cut') parts.push('cut after its last sound');
  if (entry.take !== undefined) parts.push(`take ${entry.take}`);
  if (entry.noiseScale !== undefined || entry.noiseW !== undefined || entry.trim !== undefined) {
    parts.push(`older synthesis settings (noise ${entry.noiseScale ?? '-'} / ${entry.noiseW ?? '-'}${entry.trim !== undefined ? ', trimmed' : ''})`);
  }
  return parts.length ? `Per-clip override: ${parts.join(', ')}.` : 'Per-clip override.';
}

/** A pinned clip. */
export const PIN_NOTE = 'Pinned: this exact file was chosen by ear and is never rendered again.';

/** An accepted flag; `speeds` when it explains only those. */
export function acceptedNote(speeds) {
  const which = speeds?.length ? ` (${speeds.join(' and ')} only)` : '';
  return `Accepted${which}: the check's remaining flags on this clip are a limit of the check, not a fault.`;
}
