// Chorus (params.n = 0: day, 1: night). A sunburst turning on the beat, Tomo hopping on
// the grid and squashing on every kick, and one prop per line:
//   "Tick tock…"      TICK / TOCK bubbles alternate on the detected timer ticks
//   "Count me down…"  a huge digit counts the line's eight beats down
//   "Work, then rest…" a token per word: tomatoes for work, a teacup for rest
//   "That’s what…"    the knob spins, confetti on the held last word
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, PAL, rgba, lin } from '../engine/gl';
import { F } from '../engine/type';
import type { Line } from '../engine/data';
import { clamp, ease, prog, spring, TAU, hash, mulberry32 } from '../engine/util';
import { drawTomo, drawLine, sunburstPass, setVec3, sticker, star, timerText, bump } from './_draw';
import { storyTimer } from '../timeline';

type C2D = CanvasRenderingContext2D;

export default class Chorus extends Scene {
  bg = sunburstPass();
  layer = new Layer2D();
  lines: Line[] = [];
  cuts: number[] = [];
  night = false;
  stars: { x: number; y: number; r: number; ph: number }[] = [];

  async init() {
    const { lyrics, audio, start, end, params } = this.ctx;
    const n = Number(params.n ?? 0);
    this.night = n === 1;
    this.lines = ['Tick tock', 'Count me down', 'Work, then rest', 'what the timer'].map((s) => lyrics.get(s, n));
    this.cuts = [start, ...this.lines.slice(1).map((l) => audio.nearestDownbeat(l.start)), end];
    const r = mulberry32(7);
    this.stars = Array.from({ length: 40 }, () => ({ x: r() * 1920, y: r() * 1080, r: 6 + r() * 16, ph: r() * TAU }));
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const li = Math.max(0, this.cuts.findIndex((c, k) => t >= c && t < this.cuts[k + 1]));
    const line = this.lines[li];
    const t0 = this.cuts[li], t1 = this.cuts[li + 1];
    const kick = f.a.kick;
    const last = line.words.at(-1)!;
    const finale = li === 3 ? prog(t, last.start, last.start + 0.4, ease.outCubic) : 0;

    // background
    const u = this.bg.u;
    if (this.night) {
      setVec3(u.colA, lin('#2A1A16'));
      setVec3(u.colB, lin('#3B231D'));
    } else {
      setVec3(u.colA, 'tomato');
      setVec3(u.colB, lin('#F2443A'));
    }
    u.rays.value = 14;
    u.rot.value = f.beat * 0.06 + 0.08 * ease.outCubic(clamp(1 - (f.beatPhase))) * 0 + finale * 0.6 + (t - this.ctx.start) * 0.05;
    u.pulse.value = kick;
    (u.center.value as THREE.Vector2).set(960, 640);
    this.bg.render(renderer, out);

    const c = this.layer.ctx;
    this.layer.clear();

    // night: twinkles that follow the bells (the "other" stem)
    if (this.night) {
      for (const s of this.stars) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + s.ph)) * (0.4 + f.a.other);
        c.fillStyle = rgba('butter', 0.25 + 0.6 * tw);
        star(c, s.x, s.y, s.r * tw, s.ph + t * 0.3, 4, 0.35);
        c.fill();
      }
    }

    // Tomo: a hop per beat, a squash per kick
    const cx = 960, base = 860, R = 215;
    const hop = Math.abs(Math.sin(Math.PI * f.beatPhase)) * 70;
    const sq = 1 - 0.16 * kick;
    let look: [number, number] = [0, 0];
    if (li === 0) look = [Math.floor(f.beat) % 2 ? 0.9 : -0.9, 0];
    const knobSpin = li === 3 ? prog(t, line.words[3]?.start ?? t0, (line.words[3]?.start ?? t0) + 0.6, ease.outCubic) * TAU * 2 : 0;
    drawTomo(c, cx, base - R * 0.98 - hop * (1 - kick), R, {
      sy: sq + 0.06 * (1 - kick) * Math.sin(Math.PI * f.beatPhase), sx: 2 - sq,
      mouth: finale > 0 || li === 2 ? 'open' : 'grin',
      blink: this.night ? 1 : (f.beat % 8 < 0.15 ? 1 : 0),
      look, knob: knobSpin, dial: storyTimer(t).left / storyTimer(t).total, shadow: 0.3, arms: li === 3 ? 0.4 + finale * 0.6 : 0,
    });

    // line props
    if (li === 0) this.tickTock(c, f, t0, t1);
    if (li === 1) this.countDown(c, f, t0, t1, line);
    if (li === 2) this.tokens(c, f, line);
    if (li === 3) this.confetti(c, t, last.start);

    // the lyric
    const ink = this.night ? '#120B09' : PAL.ink;
    c.save();
    c.shadowColor = ink;
    c.shadowOffsetX = 7;
    c.shadowOffsetY = 9;
    drawLine(c, line, t, 960, 205, {
      size: 128, maxW: 1700, weight: 700, align: 'center',
      sung: this.night ? PAL.butter : PAL.paper, unsung: rgba('paper', 0.28), pop: 0.22, hop: 0.12,
    });
    c.restore();

    // timer sticker
    const tm = storyTimer(t);
    c.save();
    c.translate(1700, 960);
    c.rotate(-0.05);
    sticker(c, -120, -45, 240, 90, this.night ? PAL.sky : PAL.paper, 20, 8);
    c.font = F.mono(48);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = PAL.ink;
    c.fillText(timerText(tm.left), 0, 3);
    c.font = F.mono(22);
    c.fillStyle = this.night ? PAL.butter : PAL.paper;
    c.fillText(tm.mode === 'break' ? 'BREAK' : 'FOCUS', 0, -66);
    c.restore();

    comp.draw(renderer, this.layer.upload(), out);
    const sway = Math.sin(f.bar * Math.PI) * 0.008;
    return {
      zoom: 1 + 0.02 * kick + 0.04 * finale,
      rot: sway,
      bloom: this.night ? 0.6 : 0.3,
      flash: 0.25 * clamp(1 - (t - last.start) / 0.25) * (li === 3 && t >= last.start ? 1 : 0),
      misreg: 1.4 + 3 * kick,
    };
  }

  tickTock(c: C2D, f: Frame, t0: number, t1: number) {
    const t = f.t;
    const ticks = this.ctx.audio.events('tick', t0 - 0.05, t1);
    ticks.forEach((tk, k) => {
      if (t < tk) return;
      const dt = t - tk;
      const next = ticks[k + 2] ?? t1;
      if (t > next) return;
      const left = Math.round(this.ctx.audio.beatAt(tk)) % 2 === 0;
      const s = spring(dt, 3, 9);
      c.save();
      c.translate(left ? 430 : 1490, 560 + (left ? 0 : 40));
      c.rotate(left ? -0.12 : 0.12);
      c.scale(s, s);
      c.globalAlpha = clamp(1 - (t - (next - 0.15)) / 0.15);
      sticker(c, -160, -75, 320, 150, left ? PAL.paper : PAL.butter, 75, 10);
      // tail
      c.fillStyle = left ? PAL.paper : PAL.butter;
      c.strokeStyle = PAL.ink;
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(left ? 110 : -110, 50);
      c.lineTo(left ? 190 : -190, 120);
      c.lineTo(left ? 60 : -60, 72);
      c.fill();
      c.stroke();
      c.font = F.round(78, 700);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = left ? PAL.tomato : PAL.ink;
      c.fillText(left ? 'TICK' : 'TOCK', 0, 4);
      c.restore();
    });
  }

  countDown(c: C2D, f: Frame, t0: number, t1: number, line: Line) {
    const t = f.t;
    const beats = Math.round((t1 - t0) / this.ctx.audio.beatLen);
    const k = Math.min(beats - 1, Math.floor(this.ctx.audio.beatAt(t) - this.ctx.audio.beatAt(t0) + 1e-3));
    const n = beats - k;
    const dt = t - (t0 + k * this.ctx.audio.beatLen);
    const s = 1 + 0.25 * Math.exp(-dt * 8);
    for (const side of [-1, 1]) {
      c.save();
      c.translate(960 + side * 600, 600);
      c.scale(s, s);
      c.rotate(side * 0.08);
      c.font = F.mono(420);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = this.night ? rgba('butter', 0.85) : rgba('paper', 0.92);
      c.fillText(String(n), 0, 0);
      c.restore();
    }
    // dots for the beats left
    for (let i = 0; i < beats; i++) {
      c.fillStyle = i < n ? (this.night ? PAL.butter : PAL.paper) : rgba('ink', 0.35);
      c.beginPath();
      c.arc(960 - (beats - 1) * 22 + i * 44, 330, 12, 0, TAU);
      c.fill();
    }
    void line;
  }

  tokens(c: C2D, f: Frame, line: Line) {
    const t = f.t;
    const kinds = line.words
      .map((w) => ({ w, kind: /^work/i.test(w.w) || /^more/i.test(w.w) ? 'tomato' : /^rest/i.test(w.w) ? 'cup' : '' }))
      .filter((x) => x.kind);
    const gap = 210;
    const x0 = 960 - ((kinds.length - 1) * gap) / 2;
    kinds.forEach(({ w, kind }, i) => {
      if (t < w.start) return;
      const s = spring(t - w.start, 2.6, 7);
      const x = i < 2 ? 260 + i * 200 : 1460 + (i - 2) * 200;
      const y = 560;
      void x0;
      c.save();
      c.translate(x, y - bump(t - w.start) * 30);
      c.scale(s, s);
      if (kind === 'tomato') {
        drawTomo(c, 0, 0, 70, { blink: 1, mouth: 'smile', shadow: 0, dial: 0 });
      } else {
        // teacup
        c.fillStyle = PAL.sky;
        c.strokeStyle = PAL.ink;
        c.lineWidth = 6;
        c.beginPath();
        c.moveTo(-70, -30);
        c.lineTo(70, -30);
        c.quadraticCurveTo(66, 60, 0, 66);
        c.quadraticCurveTo(-66, 60, -70, -30);
        c.fill();
        c.stroke();
        c.beginPath();
        c.arc(78, 4, 24, -1.2, 1.4);
        c.stroke();
        c.beginPath();
        c.ellipse(0, 72, 100, 14, 0, 0, TAU);
        c.fillStyle = PAL.paper;
        c.fill();
        c.stroke();
        c.strokeStyle = rgba('paper', 0.9);
        c.lineWidth = 5;
        for (let k = 0; k < 3; k++) {
          c.beginPath();
          for (let s2 = 0; s2 <= 12; s2++) {
            const yy = -45 - s2 * 7;
            const xx = -25 + k * 25 + Math.sin(s2 * 0.6 - t * 5 + k) * 7;
            if (s2) c.lineTo(xx, yy); else c.moveTo(xx, yy);
          }
          c.stroke();
        }
      }
      c.restore();
      // label
      c.font = F.mono(26);
      c.fillStyle = this.night ? PAL.butter : PAL.paper;
      c.textAlign = 'center';
      c.fillText(kind === 'cup' ? 'rest' : `pomodoro ${kinds.slice(0, i + 1).filter((k) => k.kind === 'tomato').length}`, x, y + 130);
    });
  }

  confetti(c: C2D, t: number, t0: number) {
    const dt = t - t0;
    if (dt < 0) return;
    const r = mulberry32(42);
    const cols = [PAL.butter, PAL.paper, PAL.leaf, PAL.sky, PAL.blush];
    for (let i = 0; i < 90; i++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 3.0;
      const v = 700 + r() * 900;
      const spin = (r() - 0.5) * 12;
      const col = cols[Math.floor(r() * cols.length)];
      const shape = r();
      const x = 960 + Math.cos(a) * v * dt;
      const y = 400 + Math.sin(a) * v * dt + 1100 * dt * dt;
      if (y > 1150) continue;
      c.save();
      c.translate(x, y);
      c.rotate(spin * dt + i);
      c.fillStyle = col;
      if (shape < 0.4) {
        c.fillRect(-12, -6, 24, 12);
      } else if (shape < 0.75) {
        star(c, 0, 0, 16, 0, 4, 0.4);
        c.fill();
      } else {
        c.beginPath();
        c.arc(0, 0, 8, 0, TAU);
        c.fill();
      }
      c.restore();
    }
    void hash;
  }
}
