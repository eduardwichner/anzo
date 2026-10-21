import { describe, expect, it } from 'vitest';
import {
  amsterdamDate, effectiveStreak, lessonXp, nextReviewAt, nextStrength, previousDate, scorePercent, streakAfterLesson,
} from '../src/lib/gamification.js';

describe('amsterdamDate (day boundary in Europe/Amsterdam)', () => {
  it('winter (CET, UTC+1): 22:59Z is still the same day, 23:00Z is the next day', () => {
    expect(amsterdamDate(new Date('2026-01-15T22:59:59Z'))).toBe('2026-01-15');
    expect(amsterdamDate(new Date('2026-01-15T23:00:00Z'))).toBe('2026-01-16');
  });

  it('summer (CEST, UTC+2): 21:59Z is still the same day, 22:00Z is the next day', () => {
    expect(amsterdamDate(new Date('2026-07-15T21:59:59Z'))).toBe('2026-07-15');
    expect(amsterdamDate(new Date('2026-07-15T22:00:00Z'))).toBe('2026-07-16');
  });

  it('is independent of the process TZ (UTC midnight is 01:00 or 02:00 in Amsterdam)', () => {
    expect(amsterdamDate(new Date('2026-03-01T00:30:00Z'))).toBe('2026-03-01');
    expect(amsterdamDate(new Date('2026-02-28T23:30:00Z'))).toBe('2026-03-01');
  });
});

describe('previousDate', () => {
  it('handles month, year and leap-day boundaries', () => {
    expect(previousDate('2026-03-01')).toBe('2026-02-28');
    expect(previousDate('2028-03-01')).toBe('2028-02-29');
    expect(previousDate('2027-01-01')).toBe('2026-12-31');
    expect(previousDate('2026-03-30')).toBe('2026-03-29'); // day after DST switch
  });
});

describe('streakAfterLesson', () => {
  const base = { streak_current: 0, streak_best: 0, last_active_date: null };

  it('first lesson ever starts a streak of 1', () => {
    expect(streakAfterLesson(base, '2026-09-29')).toEqual({ streak_current: 1, streak_best: 1, last_active_date: '2026-09-29' });
  });

  it('a second lesson on the same day does not increase the streak', () => {
    const s = { streak_current: 3, streak_best: 5, last_active_date: '2026-09-29' };
    expect(streakAfterLesson(s, '2026-09-29')).toEqual({ streak_current: 3, streak_best: 5, last_active_date: '2026-09-29' });
  });

  it('a lesson the next day increases it and updates best', () => {
    const s = { streak_current: 5, streak_best: 5, last_active_date: '2026-09-28' };
    expect(streakAfterLesson(s, '2026-09-29')).toEqual({ streak_current: 6, streak_best: 6, last_active_date: '2026-09-29' });
  });

  it('missing a day resets to 1 and keeps best', () => {
    const s = { streak_current: 5, streak_best: 7, last_active_date: '2026-09-27' };
    expect(streakAfterLesson(s, '2026-09-29')).toEqual({ streak_current: 1, streak_best: 7, last_active_date: '2026-09-29' });
  });

  it('23:30 and 00:30 Amsterdam time are consecutive days (UTC is the same day)', () => {
    // 2026-01-15 23:30 CET = 22:30Z; 2026-01-16 00:30 CET = 23:30Z — both on 2026-01-15 in UTC.
    const day1 = amsterdamDate(new Date('2026-01-15T22:30:00Z'));
    const day2 = amsterdamDate(new Date('2026-01-15T23:30:00Z'));
    const afterFirst = streakAfterLesson(base, day1);
    expect(streakAfterLesson(afterFirst, day2).streak_current).toBe(2);
  });

  it('two lessons in one Amsterdam day spanning UTC midnight count once', () => {
    // 2026-07-16 00:30 CEST = 2026-07-15T22:30Z; 2026-07-16 02:30 CEST = 2026-07-16T00:30Z
    const a = amsterdamDate(new Date('2026-07-15T22:30:00Z'));
    const b = amsterdamDate(new Date('2026-07-16T00:30:00Z'));
    expect(a).toBe(b);
    expect(streakAfterLesson(streakAfterLesson(base, a), b).streak_current).toBe(1);
  });
});

describe('effectiveStreak', () => {
  it('shows the streak when last active today or yesterday, 0 otherwise', () => {
    const s = { streak_current: 4, last_active_date: '2026-09-28' };
    expect(effectiveStreak(s, '2026-09-28')).toBe(4);
    expect(effectiveStreak(s, '2026-09-29')).toBe(4);
    expect(effectiveStreak(s, '2026-09-30')).toBe(0);
    expect(effectiveStreak({ streak_current: 0, last_active_date: null }, '2026-09-30')).toBe(0);
  });
});

describe('XP and score', () => {
  it('+10 per first-try correct, +5 per correct after retry, +20 bonus', () => {
    expect(lessonXp(9, 9)).toBe(110);
    expect(lessonXp(7, 9)).toBe(70 + 10 + 20);
    expect(lessonXp(0, 8)).toBe(40 + 20);
  });

  it('score is first-try correct percentage', () => {
    expect(scorePercent(9, 9)).toBe(100);
    expect(scorePercent(8, 9)).toBe(89);
    expect(scorePercent(0, 9)).toBe(0);
    expect(scorePercent(0, 0)).toBe(0);
  });
});

describe('item strength', () => {
  it('+1 on correct up to 5, -1 on wrong down to 0', () => {
    expect(nextStrength(0, true)).toBe(1);
    expect(nextStrength(5, true)).toBe(5);
    expect(nextStrength(3, false)).toBe(2);
    expect(nextStrength(0, false)).toBe(0);
    expect(nextStrength(undefined, true)).toBe(1);
  });

  it('next review = now + [0,1,3,7,14,30] days by strength', () => {
    const now = new Date('2026-09-29T10:00:00Z');
    expect(nextReviewAt(0, now)).toBe('2026-09-29T10:00:00.000Z');
    expect(nextReviewAt(1, now)).toBe('2026-09-30T10:00:00.000Z');
    expect(nextReviewAt(2, now)).toBe('2026-10-02T10:00:00.000Z');
    expect(nextReviewAt(3, now)).toBe('2026-10-06T10:00:00.000Z');
    expect(nextReviewAt(4, now)).toBe('2026-10-13T10:00:00.000Z');
    expect(nextReviewAt(5, now)).toBe('2026-10-29T10:00:00.000Z');
  });
});
