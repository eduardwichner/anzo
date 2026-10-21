import { useEffect, useMemo, useRef, useState } from 'react';
import { seededShuffle } from './shuffle.js';
import { play } from '../audio/player.js';
import { tokenKey } from '../audio/tokens.js';
import { useLessonAudio } from '../audio/LessonAudioContext.jsx';

const WRONG_FLASH_MS = 600;

// Tap one word on each side. A wrong pair flashes red and counts as a mistake;
// once every pair is matched the answer is { mistakes }. Tapping a target-language card also plays it.
export default function MatchPairs({ exercise, onAnswer, locked, track, nativeLang }) {
  const rights = useMemo(
    () => seededShuffle(exercise.pairs.map((p) => p.right), `${exercise.id}:right`),
    [exercise],
  );
  const { wordAudio } = useLessonAudio();
  const [selLeft, setSelLeft] = useState(null);
  const [selRight, setSelRight] = useState(null);
  const [matched, setMatched] = useState([]); // indexes into exercise.pairs
  const [wrong, setWrong] = useState(null); // { left, right }
  const mistakes = useRef(0);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (matched.length === exercise.pairs.length) onAnswer({ mistakes: mistakes.current });
  }, [matched, exercise.pairs.length, onAnswer]);

  const tryPair = (left, right) => {
    const idx = exercise.pairs.findIndex((p) => p.left === left);
    if (exercise.pairs[idx].right === right) {
      setMatched((m) => [...m, idx]);
    } else {
      mistakes.current += 1;
      setWrong({ left, right });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setWrong(null), WRONG_FLASH_MS);
    }
    setSelLeft(null);
    setSelRight(null);
  };

  const isMatchedLeft = (left) => matched.some((i) => exercise.pairs[i].left === left);
  const isMatchedRight = (right) => matched.some((i) => exercise.pairs[i].right === right);

  const stateOf = (side, text) => {
    if (side === 'left' ? isMatchedLeft(text) : isMatchedRight(text)) return 'matched';
    if (wrong && wrong[side] === text) return 'wrong';
    if ((side === 'left' ? selLeft : selRight) === text) return 'selected';
    return 'idle';
  };

  const tapLeft = (text) => {
    play(wordAudio?.[tokenKey(text)]);
    if (selRight !== null) tryPair(text, selRight);
    else setSelLeft(selLeft === text ? null : text);
  };
  const tapRight = (text) => (selLeft !== null ? tryPair(selLeft, text) : setSelRight(selRight === text ? null : text));

  return (
    <div className="pairs">
      <div className="pairs-col">
        {exercise.pairs.map(({ left }) => (
          <button
            key={left}
            type="button"
            className="pair-btn"
            data-testid="pair-left"
            data-state={stateOf('left', left)}
            lang={track}
            disabled={locked || isMatchedLeft(left)}
            onClick={() => tapLeft(left)}
          >
            {left}
          </button>
        ))}
      </div>
      <div className="pairs-col">
        {rights.map((right) => (
          <button
            key={right}
            type="button"
            className="pair-btn"
            data-testid="pair-right"
            data-state={stateOf('right', right)}
            lang={nativeLang}
            disabled={locked || isMatchedRight(right)}
            onClick={() => tapRight(right)}
          >
            {right}
          </button>
        ))}
      </div>
    </div>
  );
}
