// Shared drawing kit: the mascot, karaoke type, and small print-shop props.
// Read-only for scenes (so the motifs look the same everywhere).
import * as THREE from 'three';
import { FSPass, PAL, rgba, lin, type PalName } from '../engine/gl';
import { Lyrics, type Line, type Word } from '../engine/data';
import { F } from '../engine/type';
import { clamp, TAU } from '../engine/util';

type C2D = CanvasRenderingContext2D;

// ------------------------------------------------------------------------------------
// Tomo: a tomato kitchen timer. Leaf cap = the knob; the band round its belly = the dial.

export interface TomoOpts {
  sx?: number; sy?: number;     // squash & stretch (1 = rest)
  rot?: number;
  blink?: number;               // 0 open .. 1 closed (closed reads as a happy ^ ^)
  mouth?: 'smile' | 'open' | 'o' | 'flat' | 'grin';
  look?: [number, number];      // pupils, -1..1
  dial?: number;                // 0..1 of the dial still to run (band shows it)
  knob?: number;                // leaf-cap rotation (winding), radians
  arms?: number;                // 0 none, 0..1 arms up, >1 stretch
  shadow?: number;              // ground shadow opacity
  body?: PalName;
  outline?: boolean;
}

export function drawTomo(c: C2D, x: number, y: number, R: number, o: TomoOpts = {}) {
  const sx = o.sx ?? 1, sy = o.sy ?? 1;
  const ink = PAL.ink;
  const lw = R * 0.045;
  if ((o.shadow ?? 0.18) > 0) {
    c.save();
    c.fillStyle = rgba('ink', o.shadow ?? 0.18);
    c.beginPath();
    c.ellipse(x, y + R * 0.98 * sy, R * 0.8 * sx, R * 0.13, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  c.save();
  c.translate(x, y + R * (1 - sy) * 0.9); // squash about the floor
  c.rotate(o.rot ?? 0);
  c.scale(sx, sy);
  c.lineJoin = 'round';
  c.lineCap = 'round';

  // arms (behind the body)
  const arms = o.arms ?? 0;
  if (arms > 0) {
    c.strokeStyle = ink;
    c.lineWidth = lw * 1.2;
    for (const s of [-1, 1]) {
      const reach = R * (0.55 + 0.45 * Math.min(arms, 2));
      const ang = -Math.PI / 2 + s * (1.25 - 0.85 * Math.min(arms, 1));
      const hx = s * R * 0.8 + Math.cos(ang) * reach * 0.6, hy = R * 0.05 + Math.sin(ang) * reach;
      c.beginPath();
      c.moveTo(s * R * 0.85, R * 0.12);
      c.quadraticCurveTo(s * R * 1.15, R * 0.05 - reach * 0.2, hx, hy);
      c.stroke();
      c.fillStyle = PAL.paper;
      c.beginPath();
      c.arc(hx, hy, R * 0.09, 0, TAU);
      c.fill();
      c.stroke();
    }
  }

  // body: a slightly lobed, slightly flattened ball with a dent at the top
  const body = new Path2D();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const da = Math.atan2(Math.sin(a - Math.PI * 1.5), Math.cos(a - Math.PI * 1.5)); // angle from the top
    const top = Math.exp(-(da * da) / 0.08);
    const r = R * (1 + 0.025 * Math.cos(5 * da)) - R * 0.09 * top;
    const px = Math.cos(a) * r * 1.04, py = Math.sin(a) * r * 0.9;
    if (i) body.lineTo(px, py); else body.moveTo(px, py);
  }
  body.closePath();
  c.fillStyle = PAL[o.body ?? 'tomato'];
  c.fill(body);
  c.save();
  c.clip(body);
  let g = c.createRadialGradient(R * 0.35, R * 0.55, R * 0.1, R * 0.2, R * 0.4, R * 1.3);
  g.addColorStop(0, rgba('tomatoDk', 0));
  g.addColorStop(1, rgba('tomatoDk', 0.75));
  c.fillStyle = g;
  c.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);
  g = c.createRadialGradient(-R * 0.4, -R * 0.45, 0, -R * 0.4, -R * 0.45, R * 0.9);
  g.addColorStop(0, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(-R * 1.2, -R * 1.2, R * 2.4, R * 2.4);

  // the dial band
  const dial = o.dial ?? 1;
  const by = R * 0.5, brx = R * 1.0, bry = R * 0.26;
  c.lineWidth = R * 0.15;
  c.strokeStyle = rgba('paper', 0.95);
  c.beginPath();
  c.ellipse(0, by, brx, bry, 0, 0.05, Math.PI - 0.05);
  c.stroke();
  // elapsed part of the dial goes dark (from the right end towards the left)
  if (dial < 1) {
    c.strokeStyle = PAL.tomatoDk;
    c.beginPath();
    c.ellipse(0, by, brx, bry, 0, 0.05, 0.05 + (Math.PI - 0.1) * (1 - clamp(dial)));
    c.stroke();
  }
  c.strokeStyle = ink;
  c.lineWidth = lw * 0.5;
  for (let i = 0; i <= 12; i++) {
    const a = 0.12 + (i / 12) * (Math.PI - 0.24);
    const ex = Math.cos(a) * brx, ey = by + Math.sin(a) * bry;
    const len = i % 3 === 0 ? 0.075 : 0.04;
    c.beginPath();
    c.moveTo(ex, ey - R * len);
    c.lineTo(ex, ey + R * len);
    c.stroke();
  }
  c.restore();
  if (o.outline !== false) {
    c.strokeStyle = ink;
    c.lineWidth = lw;
    c.stroke(body);
  }
  // pointer at the front of the band
  c.fillStyle = ink;
  c.beginPath();
  c.moveTo(0, by + bry - R * 0.13);
  c.lineTo(-R * 0.05, by + bry - R * 0.22);
  c.lineTo(R * 0.05, by + bry - R * 0.22);
  c.closePath();
  c.fill();

  // gloss
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath();
  c.ellipse(-R * 0.55, -R * 0.38, R * 0.12, R * 0.06, -0.7, 0, TAU);
  c.fill();
  c.beginPath();
  c.arc(-R * 0.38, -R * 0.5, R * 0.03, 0, TAU);
  c.fill();

  // face
  const blink = clamp(o.blink ?? 0);
  const [lx, ly] = o.look ?? [0, 0];
  c.fillStyle = rgba('blush', 0.85);
  for (const s of [-1, 1]) {
    c.beginPath();
    c.ellipse(s * R * 0.47, R * 0.08, R * 0.11, R * 0.065, 0, 0, TAU);
    c.fill();
  }
  for (const s of [-1, 1]) {
    const ex = s * R * 0.27 + lx * R * 0.04, ey = -R * 0.1 + ly * R * 0.04;
    if (blink > 0.8) {
      c.strokeStyle = ink;
      c.lineWidth = lw * 1.1;
      c.beginPath();
      c.arc(ex, ey + R * 0.05, R * 0.08, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    } else {
      c.fillStyle = ink;
      c.beginPath();
      c.ellipse(ex, ey, R * 0.075, R * 0.11 * (1 - blink) + R * 0.01, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(ex - R * 0.025, ey - R * 0.04 * (1 - blink), R * 0.028 * (1 - blink), 0, TAU);
      c.fill();
    }
  }
  c.strokeStyle = ink;
  c.fillStyle = ink;
  c.lineWidth = lw * 1.1;
  const my = R * 0.1;
  switch (o.mouth ?? 'smile') {
    case 'smile':
      c.beginPath();
      c.arc(0, my - R * 0.05, R * 0.09, Math.PI * 0.15, Math.PI * 0.85);
      c.stroke();
      break;
    case 'grin':
    case 'open': {
      c.beginPath();
      c.moveTo(-R * 0.11, my - R * 0.02);
      c.quadraticCurveTo(0, my + R * (o.mouth === 'open' ? 0.2 : 0.13), R * 0.11, my - R * 0.02);
      c.closePath();
      c.fill();
      c.fillStyle = PAL.blush;
      c.beginPath();
      c.ellipse(0, my + R * 0.06, R * 0.05, R * 0.03, 0, 0, TAU);
      c.fill();
      break;
    }
    case 'o':
      c.beginPath();
      c.ellipse(0, my + R * 0.02, R * 0.045, R * 0.06, 0, 0, TAU);
      c.fill();
      break;
    case 'flat':
      c.beginPath();
      c.moveTo(-R * 0.07, my);
      c.lineTo(R * 0.07, my);
      c.stroke();
      break;
  }

  // leaf cap (the knob)
  c.save();
  c.translate(0, -R * 0.82);
  c.rotate(o.knob ?? 0);
  c.scale(1, 0.5);
  c.fillStyle = PAL.leaf;
  c.strokeStyle = ink;
  c.lineWidth = lw * 1.3;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * TAU;
    const tip = R * (0.48 + 0.06 * Math.sin(i * 2.3));
    const w = 0.36;
    c.moveTo(0, 0);
    c.quadraticCurveTo(Math.cos(a - w) * tip * 0.75, Math.sin(a - w) * tip * 0.75, Math.cos(a) * tip, Math.sin(a) * tip);
    c.quadraticCurveTo(Math.cos(a + w) * tip * 0.75, Math.sin(a + w) * tip * 0.75, 0, 0);
  }
  c.fill();
  c.stroke();
  c.restore();
  // stem
  c.fillStyle = PAL.leafDk;
  c.strokeStyle = ink;
  c.lineWidth = lw;
  c.beginPath();
  c.roundRect(-R * 0.05, -R * 1.02, R * 0.1, R * 0.22, R * 0.04);
  c.fill();
  c.stroke();
  c.restore();
}

// ------------------------------------------------------------------------------------
// Karaoke type

export interface LineStyle {
  font: string;
  size: number;
  sung?: string;          // colour of sung text
  unsung?: string;        // colour of text not yet sung
  lead?: number;          // s before a word's start that it appears (dim)
  pop?: number;           // scale bump when a word starts
  hop?: number;           // vertical hop (fraction of size) when a word starts
  align?: 'left' | 'center' | 'right';
  wipe?: boolean;         // fill left to right through the word
  tracking?: number;      // extra px between letters
  hideUnsung?: boolean;   // words appear only when sung
}

export interface WordBox { w: Word; x: number; y: number; width: number; p: number; on: boolean }

/** Bump of a word that started dt seconds ago: 0 -> peak -> 0 with a small overshoot. */
export const bump = (dt: number) => (dt < 0 ? 0 : Math.exp(-dt * 7.5) * Math.sin(Math.min(dt * 16, Math.PI * 1.5)));

/** Lays out `words` on one row at (x, baseline y) and draws them karaoke-style. */
export function drawWords(c: C2D, words: Word[], t: number, x: number, y: number, s: LineStyle): WordBox[] {
  c.save();
  c.font = s.font;
  c.textBaseline = 'alphabetic';
  (c as unknown as { letterSpacing: string }).letterSpacing = `${s.tracking ?? 0}px`;
  const space = c.measureText(' ').width;
  const widths = words.map((w) => c.measureText(w.w).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (words.length - 1);
  let cx = s.align === 'center' ? x - total / 2 : s.align === 'right' ? x - total : x;
  const boxes: WordBox[] = [];
  words.forEach((w, i) => {
    const dt = t - w.start;
    const appear = clamp((t - (w.start - (s.lead ?? 0.35))) / 0.18);
    const on = dt >= 0;
    const p = Lyrics.wordProgress(w, t);
    const bx = cx, wd = widths[i];
    boxes.push({ w, x: bx, y, width: wd, p, on });
    cx += wd + space;
    if (appear <= 0 || (s.hideUnsung && !on)) return;
    const b = bump(dt);
    const sc = 1 + (s.pop ?? 0.12) * b;
    const hy = -(s.hop ?? 0.08) * s.size * b;
    c.save();
    c.translate(bx + wd / 2, y + hy);
    c.scale(sc, sc);
    c.translate(-wd / 2, 0);
    if (!on || s.wipe) {
      c.globalAlpha = appear;
      c.fillStyle = s.unsung ?? rgba('ink', 0.25);
      c.fillText(w.w, 0, 0);
      c.globalAlpha = 1;
    }
    if (on) {
      if (s.wipe) {
        c.beginPath();
        c.rect(-10, -s.size * 1.5, (wd + 20) * clamp(p * 1.4), s.size * 2.5);
        c.clip();
      }
      c.fillStyle = s.sung ?? PAL.tomato;
      c.fillText(w.w, 0, 0);
    }
    c.restore();
  });
  c.restore();
  return boxes;
}

/** A whole lyric line, with optional automatic size to fit `maxW`. */
export function drawLine(c: C2D, line: Line, t: number, x: number, y: number, s: Partial<LineStyle> & { maxW?: number; family?: 'round' | 'serif' | 'mono'; weight?: number } = {}) {
  const fam = s.family ?? 'round';
  const mk = (px: number) => (fam === 'round' ? F.round(px, s.weight ?? 600) : fam === 'serif' ? F.serif(px, s.weight ?? 500) : F.mono(px));
  let size = s.size ?? 96;
  if (s.maxW) {
    c.font = mk(100);
    const w = c.measureText(line.text).width;
    size = Math.min(size, (100 * s.maxW) / w);
  }
  return drawWords(c, line.words, t, x, y, { ...s, font: mk(size), size } as LineStyle);
}

// ------------------------------------------------------------------------------------
// Props

export function timerText(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds - 1e-6));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** A sticker: rounded rect with an ink outline and a drop shadow. */
export function sticker(c: C2D, x: number, y: number, w: number, h: number, fill: string, r = 18, shadow = 8) {
  c.save();
  c.fillStyle = rgba('ink', 0.9);
  c.beginPath();
  c.roundRect(x + shadow * 0.6, y + shadow, w, h, r);
  c.fill();
  c.fillStyle = fill;
  c.strokeStyle = PAL.ink;
  c.lineWidth = 4;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
  c.stroke();
  c.restore();
}

export function star(c: C2D, x: number, y: number, r: number, rot = 0, points = 4, inner = 0.42) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) c.lineTo(px, py); else c.moveTo(px, py);
  }
  c.closePath();
}

const dotCache = new Map<string, CanvasPattern>();
/** Halftone dot pattern (cached). */
export function dots(c: C2D, color: string, step = 14, r = 2.6) {
  const k = `${color}|${step}|${r}`;
  let p = dotCache.get(k);
  if (!p) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = step * 2;
    const x = cv.getContext('2d')!;
    x.fillStyle = color;
    for (const [px, py] of [[step / 2, step / 2], [step * 1.5, step * 1.5]]) {
      x.beginPath();
      x.arc(px, py, r, 0, TAU);
      x.fill();
    }
    p = c.createPattern(cv, 'repeat')!;
    dotCache.set(k, p);
  }
  return p;
}

// ------------------------------------------------------------------------------------
// Backgrounds (GLSL)

/** Flat paper with a soft halftone falloff; colours given as palette names. */
export function paperPass() {
  return new FSPass(/* glsl */ `
    uniform vec3 colA, colB; uniform float dotAmt, t; uniform vec2 dotCenter;
    void main() {
      vec2 p = fragPx();
      vec3 c = colA;
      // halftone: dots grow towards the edges of the frame
      float g = 14.;
      mat2 R = mat2(.7071, -.7071, .7071, .7071);
      vec2 q = R * p / g;
      vec2 cell = fract(q) - .5;
      float d = length(p - dotCenter) / 1100.;
      float rad = .5 * clamp(d * d * 1.3 * dotAmt, 0., .9);
      float m = aa((length(cell) - rad) * g);
      c = mix(c, colB, m);
      fragColor = vec4(c, 1.);
    }`, {
    colA: { value: new THREE.Vector3(...lin('paper')) }, colB: { value: new THREE.Vector3(...lin('paper2')) },
    dotAmt: { value: 1 }, t: { value: 0 }, dotCenter: { value: new THREE.Vector2(960, 540) },
  });
}

/** Rotating sunburst rays around `center`. */
export function sunburstPass() {
  return new FSPass(/* glsl */ `
    uniform vec3 colA, colB; uniform float rot, rays, pulse; uniform vec2 center;
    void main() {
      vec2 p = fragPx() - center;
      float a = atan(p.y, p.x) + rot;
      float s = sin(a * rays);
      float w = fwidth(a * rays) * 1.2 + 1e-4;
      float m = smoothstep(-w, w, s);
      vec3 c = mix(colA, colB, m);
      float r = length(p);
      c *= 1. + pulse * .25 * exp(-r / 500.);
      fragColor = vec4(c, 1.);
    }`, {
    colA: { value: new THREE.Vector3(...lin('tomato')) }, colB: { value: new THREE.Vector3(...lin('tomatoDk')) },
    rot: { value: 0 }, rays: { value: 12 }, pulse: { value: 0 }, center: { value: new THREE.Vector2(960, 540) },
  });
}

export function setVec3(u: THREE.IUniform, name: PalName | [number, number, number]) {
  (u.value as THREE.Vector3).set(...(typeof name === 'string' ? lin(name) : name));
}
