// The song as the analysis recovered it: word-level lyrics and the audio map.
import lyricsJson from '../../../data/lyrics.json';
import audioJson from '../../../data/audio.json';
import { clamp } from './util';

export interface Word { w: string; start: number; end: number; line: number; index: number }
export interface Line { text: string; start: number; end: number; words: Word[]; index: number }

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]/g, '');

export class Lyrics {
  lines: Line[];
  constructor(src = lyricsJson as { lines: { text: string; start: number; end: number; words: { w: string; start: number; end: number }[] }[] }) {
    this.lines = src.lines.map((l, i) => ({
      ...l,
      index: i,
      words: l.words.map((w, j) => ({ ...w, line: i, index: j })),
    }));
  }
  /** nth line whose text contains `text` (case and punctuation insensitive). */
  get(text: string, nth = 0): Line {
    const q = norm(text);
    const hits = this.lines.filter((l) => norm(l.text).includes(q));
    if (!hits[nth]) throw new Error(`no lyric line "${text}" #${nth}`);
    return hits[nth];
  }
  /** The line being sung (or about to be, within `lead` s) at t. */
  at(t: number, lead = 0.4): Line | undefined {
    return this.lines.find((l) => t >= l.start - lead && t < l.end + 0.25);
  }
  static wordProgress(w: Word, t: number) {
    return clamp((t - w.start) / Math.max(0.06, w.end - w.start));
  }
  /** Index of the last word started at t (-1 before the first). */
  static sungCount(l: Line, t: number) {
    let n = 0;
    for (const w of l.words) if (t >= w.start) n++;
    return n;
  }
}

type EventKind = 'kick' | 'snare' | 'hat' | 'tick' | 'vocal';
type EnvName = 'rms' | 'low' | 'mid' | 'high' | 'vocals' | 'drums' | 'bass' | 'other';

interface AudioJson {
  duration: number; bpm: number; beat: number; offset: number;
  beats: number[]; downbeats: number[];
  sections: { start: number; end: number; label: string; energy: number }[];
  events: Record<EventKind, number[]>;
  env: { fps: number } & Record<EnvName, number[]>;
}

function lastIndexLE(a: number[], t: number) {
  let lo = 0, hi = a.length - 1, r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a[m] <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

export class AudioMap {
  d = audioJson as unknown as AudioJson;
  get duration() { return this.d.duration; }
  get bpm() { return this.d.bpm; }
  get beatLen() { return this.d.beat; }
  get downbeats() { return this.d.downbeats; }
  get sections() { return this.d.sections; }
  /** Continuous beat index (0 at the first beat). */
  beatAt(t: number) { return (t - this.d.offset) / this.d.beat; }
  /** Continuous bar index (0 at the first downbeat). */
  barAt(t: number) { return (t - this.d.downbeats[0]) / (4 * this.d.beat); }
  timeOfBeat(i: number) { return this.d.offset + i * this.d.beat; }
  nearestDownbeat(t: number) {
    let best = this.d.downbeats[0];
    for (const d of this.d.downbeats) if (Math.abs(d - t) < Math.abs(best - t)) best = d;
    return best;
  }
  events(kind: EventKind, t0 = -Infinity, t1 = Infinity) {
    return this.d.events[kind].filter((e) => e >= t0 && e < t1);
  }
  /** Time since the last `kind` event (Infinity if none). */
  since(kind: EventKind, t: number) {
    const i = lastIndexLE(this.d.events[kind], t);
    return i < 0 ? Infinity : t - this.d.events[kind][i];
  }
  /** Decaying pulse from the latest `kind` event: 1 at the hit, 0.5 after `half` s. */
  hit(kind: EventKind, t: number, half = 0.1) {
    const s = this.since(kind, t);
    return s === Infinity ? 0 : Math.pow(0.5, s / half);
  }
  /** Number of `kind` events at or before t. */
  count(kind: EventKind, t: number) { return lastIndexLE(this.d.events[kind], t) + 1; }
  env(name: EnvName, t: number) {
    const a = this.d.env[name];
    const x = clamp(t * this.d.env.fps, 0, a.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    return a[i] * (1 - f) + (a[Math.min(i + 1, a.length - 1)] ?? 0) * f;
  }
}
