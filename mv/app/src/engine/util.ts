// Small math helpers. Everything visual must be a pure function of song time,
// so randomness here is always seeded (hash, mulberry32), never Math.random().

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const remap = (x: number, a: number, b: number, c = 0, d = 1) => c + (d - c) * clamp((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inExpo: (t: number) => (t <= 0 ? 0 : 2 ** (10 * t - 10)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  outBack: (t: number, s = 1.9) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  inBack: (t: number, s = 1.7) => (s + 1) * t * t * t - s * t * t,
  outElastic: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** 0..1 progress of t through [a, b], eased. */
export const prog = (t: number, a: number, b: number, e: Ease = ease.linear) => e(clamp((t - a) / (b - a)));

/** Damped spring response to a step at time 0: 0 before, settles at 1, overshoots. */
export const spring = (t: number, freq = 3.2, damp = 7) =>
  t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(2 * Math.PI * freq * t);

/** Decaying pulse after time 0 (1 at 0, half after `half` s). */
export const pulse = (t: number, half = 0.12) => (t < 0 ? 0 : Math.pow(0.5, t / half));

/** Keyframes: [[time, value, ease?], ...] -> value at t. */
export function keys(t: number, k: [number, number, Ease?][]) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t < k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1, e] = k[i];
      return lerp(v0, v1, (e ?? ease.inOutCubic)((t - t0) / (t1 - t0)));
    }
  }
  return k[k.length - 1][1];
}

export function hash(n: number) {
  let x = Math.imul((n * 2654435761) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (a: number, b: number) => hash(a * 7919 + b * 104729 + 17);

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise, -1..1. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed), hash2(i + 1, seed), u) * 2 - 1;
}

/** Frame rate of the output. Per-frame jitter must use frameIdx(t), which is constant
 *  over a frame's motion-blur shutter, not Math.floor(t * fps). */
export let FPS = 60;
export const setFPS = (f: number) => (FPS = f);
export const frameIdx = (t: number) => Math.floor(t * FPS + 1e-4);

export const TAU = Math.PI * 2;
