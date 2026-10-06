// The edit. Scene windows are anchored to lyric lines (as the aligner found them) and
// snapped to the downbeats the analysis found, so nothing here is a hard-coded time.
import { AudioMap, Lyrics } from './engine/data';
import type { Entry } from './engine/engine';

const L = new Lyrics();
const A = new AudioMap();
const db = (t: number) => A.nearestDownbeat(t);
const nextDb = (t: number) => A.downbeats.find((d) => d >= t - 0.05) ?? A.duration;

export const MARKS = {
  verse: db(L.get('Twenty-five minutes').start),
  chorus1: db(L.get('Tick tock', 0).start),
  bridge: db(L.get('Ring ring').start),
  stretch: db(L.get('Stretch your arms').start),
  chorus2: db(L.get('Tick tock', 1).start),
  outro: nextDb(L.get('timer’s for', 1).end),
  end: A.duration,
};

const chorus = () => import('./scenes/chorus');

export const TIMELINE: Entry[] = [
  { name: 'intro', load: () => import('./scenes/intro'), start: 0, end: MARKS.verse },
  { name: 'verse', load: () => import('./scenes/verse'), start: MARKS.verse, end: MARKS.chorus1 },
  { name: 'chorus', load: chorus, start: MARKS.chorus1, end: MARKS.bridge, params: { n: 0 } },
  { name: 'bridge', load: () => import('./scenes/bridge'), start: MARKS.bridge, end: MARKS.chorus2 },
  { name: 'chorus2', load: chorus, start: MARKS.chorus2, end: MARKS.outro, params: { n: 1 } },
  { name: 'outro', load: () => import('./scenes/outro'), start: MARKS.outro, end: MARKS.end },
];

/**
 * The story clock shown on every timer in the video (seconds left on the dial):
 * wound up to 25:00 in the intro, runs out exactly when the bell rings, then a
 * 5:00 break runs to the end and the outro winds it back to 25:00 (so it loops).
 */
export function storyTimer(t: number): { left: number; total: number; mode: 'focus' | 'break' } {
  const wind0 = MARKS.verse - 2 * A.beatLen * 4 * 0.5; // the last bar of the intro
  if (t < MARKS.bridge) {
    if (t < wind0) return { left: 0, total: 1500, mode: 'focus' };
    if (t < MARKS.verse) return { left: 1500 * Math.min(1, (t - wind0) / (MARKS.verse - wind0)) ** 0.7, total: 1500, mode: 'focus' };
    return { left: 1500 * (1 - (t - MARKS.verse) / (MARKS.bridge - MARKS.verse)), total: 1500, mode: 'focus' };
  }
  const b0 = MARKS.bridge + 2 * A.beatLen; // after the two rings
  if (t < b0) return { left: 0, total: 1500, mode: 'focus' };
  if (t < MARKS.outro) return { left: 300 * (1 - (t - b0) / (MARKS.outro - b0)), total: 300, mode: 'break' };
  return { left: 1500, total: 1500, mode: 'focus' };
}
