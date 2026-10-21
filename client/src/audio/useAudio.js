import { useEffect, useState } from 'react';
import { getState, subscribe } from './player.js';

/** { playing, url } of the shared audio element. */
export function useAudioState() {
  const [s, setS] = useState(getState);
  useEffect(() => subscribe(setS), []);
  return s;
}
