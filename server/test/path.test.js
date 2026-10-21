// Home path lesson states (client/src/lib/path.js): sequential unlocking and the admin-set start level.
import { describe, expect, it } from 'vitest';
import { currentPosition, isBeforeStart, lessonStates, packProgress, packExtras } from '../../client/src/lib/path.js';

const pack = (id, n) => ({ id, units: [{ lessons: Array.from({ length: n }, (_, i) => ({ id: `${id}-l${i + 1}` })) }] });
const PACKS = [pack('s', 3), pack('m', 2), pack('f', 2)];
const states = (done, start) => Object.fromEntries(lessonStates(PACKS, done, start));

describe('lessonStates', () => {
  it('without a start level: the first lesson not done is current, everything after it locked', () => {
    expect(states({}, null)).toEqual({ 's-l1': 'current', 's-l2': 'locked', 's-l3': 'locked', 'm-l1': 'locked', 'm-l2': 'locked', 'f-l1': 'locked', 'f-l2': 'locked' });
    expect(states({ 's-l1': {}, 's-l2': {} }, null)).toMatchObject({ 's-l1': 'done', 's-l2': 'done', 's-l3': 'current', 'm-l1': 'locked' });
  });

  it('with a start level: earlier levels are optional (playable), the path starts at the first lesson of that level', () => {
    expect(states({}, 'm')).toEqual({ 's-l1': 'optional', 's-l2': 'optional', 's-l3': 'optional', 'm-l1': 'current', 'm-l2': 'locked', 'f-l1': 'locked', 'f-l2': 'locked' });
    expect(states({ 's-l2': {}, 'm-l1': {} }, 'm')).toMatchObject({ 's-l1': 'optional', 's-l2': 'done', 'm-l1': 'done', 'm-l2': 'current' });
    expect(states({}, 'f')).toMatchObject({ 'm-l2': 'optional', 'f-l1': 'current' });
  });

  it('an unknown or first-pack start level behaves like none', () => {
    expect(states({}, 'nope')).toEqual(states({}, null));
    expect(states({}, 's')).toEqual(states({}, null));
    expect(isBeforeStart(PACKS, 's', 'm')).toBe(true);
    expect(isBeforeStart(PACKS, 'm', 'm')).toBe(false);
    expect(isBeforeStart(PACKS, 's', null)).toBe(false);
  });
});

describe('packProgress and currentPosition', () => {
  it('counts the done lessons of one pack', () => {
    expect(packProgress(PACKS[0], { 's-l1': {}, 'm-l1': {} })).toEqual({ done: 1, total: 3, percent: 33 });
    expect(packProgress(PACKS[2], {})).toEqual({ done: 0, total: 2, percent: 0 });
  });

  it('finds the pack and unit of the current lesson, null when all is done', () => {
    expect(currentPosition(PACKS, lessonStates(PACKS, { 's-l1': {}, 's-l2': {}, 's-l3': {} }, null))).toEqual({ packId: 'm', unitId: undefined, lessonId: 'm-l1' });
    const all = Object.fromEntries(PACKS.flatMap((p) => p.units[0].lessons.map((l) => [l.id, {}])));
    expect(currentPosition(PACKS, lessonStates(PACKS, all, null))).toBeNull();
  });
});

describe('extra lessons (Extra oefening)', () => {
  const P = [{ id: 's', units: [{ lessons: [{ id: 's-l1' }, { id: 's-review' }, { id: 's-extra', extra: true }] }, { lessons: [{ id: 's-u2-l1' }] }] }];
  it('are optional: never the current lesson, never locked, and not counted in the level ring', () => {
    expect(Object.fromEntries(lessonStates(P, { 's-l1': {}, 's-review': {} }, null))).toEqual({ 's-l1': 'done', 's-review': 'done', 's-extra': 'optional', 's-u2-l1': 'current' });
    expect(Object.fromEntries(lessonStates(P, {}, null))).toMatchObject({ 's-l1': 'current', 's-extra': 'optional' });
    expect(packProgress(P[0], { 's-l1': {}, 's-review': {} })).toEqual({ done: 2, total: 3, percent: 67 });
    expect(packProgress(P[0], { 's-l1': {}, 's-review': {}, 's-extra': {}, 's-u2-l1': {} })).toEqual({ done: 3, total: 3, percent: 100 });
  });
});

describe('Extra oefening done state', () => {
  it('packExtras counts the extra lessons apart; packProgress and lessonStates still ignore them for the level', () => {
    const pack = { id: 'p', units: [{ lessons: [{ id: 'a' }, { id: 'b' }, { id: 'x', extra: true }, { id: 'y', extra: true }] }] };
    expect(packExtras(pack, { x: {} })).toEqual({ done: 1, total: 2 });
    expect(packProgress(pack, { a: {}, b: {}, x: {} })).toEqual({ done: 2, total: 2, percent: 100 });
    const states = lessonStates([pack], { x: {} }, null);
    expect(states.get('x')).toBe('done');
    expect(states.get('y')).toBe('optional');
    expect(states.get('a')).toBe('current');
  });
});
