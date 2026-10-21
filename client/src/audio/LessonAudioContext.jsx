import { createContext, useContext } from 'react';

/** Per-lesson context: { track, wordAudio: {token: url}, autoplay: boolean, texts: {textId: public text} }. */
export const LessonAudioContext = createContext({ track: null, wordAudio: {}, autoplay: false, texts: {} });

export function useLessonAudio() {
  return useContext(LessonAudioContext);
}
