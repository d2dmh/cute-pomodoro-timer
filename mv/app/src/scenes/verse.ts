// Verse: four plates, one per line, each cut on the downbeat nearest the line's first word.
//   A  the readout counts down from 25:00
//   B  the phone: notifications pop in on the hats, it flips face down, the noises pop
//   C  Tomo on the desk, labelled like a diagram
//   D  the to-do list: the next thing gets ticked, the rest falls off the page
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, PAL, rgba } from '../engine/gl';
import { F } from '../engine/type';
import type { Line } from '../engine/data';
import { clamp, ease, prog, spring, TAU, hash, lerp } from '../engine/util';
import { drawTomo, drawLine, drawWords, paperPass, timerText, sticker, star, dots, bump } from './_draw';
import { storyTimer } from '../timeline';

type C2D = CanvasRenderingContext2D;

export default class Verse extends Scene {
  bg = paperPass();
  layer = new Layer2D();
  lines: Line[] = [];
  cuts: number[] = [];
  hats: number[] = [];

  async init() {
    const { lyrics, audio, start, end } = this.ctx;
    this.lines = ['Twenty-five minutes', 'Phone face down', 'One small tomato', 'Do the next thing'].map((s) => lyrics.get(s));
    this.cuts = [start, ...this.lines.slice(1).map((l) => audio.nearestDownbeat(l.start)), end];
    this.hats = audio.events('hat', start, end);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const i = Math.max(0, this.cuts.findIndex((c, k) => t >= c && t < this.cuts[k + 1]));
    const t0 = this.cuts[i], t1 = this.cuts[i + 1];
    this.bg.u.dotAmt.value = i === 2 ? 0.4 : 0.8;
    this.bg.render(renderer, out);
    const c = this.layer.ctx;
    this.layer.clear();
    let post = {};
    if (i === 0) this.plateA(c, f, t0, t1);
    else if (i === 1) this.plateB(c, f, t0, t1);
    else if (i === 2) this.plateC(c, f, t0, t1);
    else post = this.plateD(c, f, t0, t1);
    comp.draw(renderer, this.layer.upload(), out);
    return post;
  }

  // A: "Twenty-five minutes on the clock"
  plateA(c: C2D, f: Frame, t0: number, t1: number) {
    const t = f.t;
    const line = this.lines[0];
    const timer = storyTimer(t);
    const pin = spring(t - t0, 2.2, 7);
    // readout
    c.save();
    c.translate(960, 380);
    c.scale(pin, pin);
    c.rotate(-0.03 + 0.02 * bump(t - line.words.at(-1)!.start));
    const txt = timerText(timer.left);
    c.font = F.mono(290);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = PAL.ink;
    c.fillText(txt, 10, 14);
    c.fillStyle = PAL.tomato;
    c.fillText(txt, 0, 0);
    // progress bar
    const bw = 900, bh = 34;
    c.fillStyle = PAL.paper;
    c.strokeStyle = PAL.ink;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(-bw / 2, 175, bw, bh, bh / 2);
    c.fill();
    c.stroke();
    c.fillStyle = PAL.tomato;
    c.beginPath();
    c.roundRect(-bw / 2 + 6, 181, (bw - 12) * (timer.left / timer.total), bh - 12, (bh - 12) / 2);
    c.fill();
    c.font = F.mono(26);
    c.fillStyle = PAL.ink;
    c.textAlign = 'left';
    c.fillText('FOCUS', -bw / 2, 245);
    c.textAlign = 'right';
    c.fillText(`${Math.round((1 - timer.left / timer.total) * 100)}%`, bw / 2, 245);
    c.restore();
    drawLine(c, line, t, 960, 790, { size: 104, maxW: 1560, align: 'center', unsung: rgba('ink', 0.22), sung: PAL.ink, pop: 0.18 });
    // Tomo peeks from the bottom edge, bobbing on the ticks
    const peek = prog(t, t0 + 0.2, t0 + 0.8, ease.outBack);
    const tick = f.a.tick;
    drawTomo(c, 1730, 1080 + 150 - 250 * peek, 150, {
      sy: 1 - 0.06 * tick, sx: 1 + 0.05 * tick, rot: -0.15, look: [-0.8, -0.6], shadow: 0, dial: timer.left / timer.total,
      blink: t - t0 > 2.1 && t - t0 < 2.2 ? 1 : 0,
    });
  }

  // B: "Phone face down, let the noises stop"
  plateB(c: C2D, f: Frame, t0: number, t1: number) {
    const t = f.t;
    const line = this.lines[1];
    const W = line.words;
    const down = W.find((w) => w.w.startsWith('down'))!;
    const noises = W.find((w) => w.w.startsWith('noises'))!;
    const stop = W.at(-1)!;
    // lyrics: two rows on the left
    drawWords(c, W.slice(0, 3), t, 150, 470, { font: F.round(118, 700), size: 118, sung: PAL.ink, unsung: rgba('ink', 0.18), pop: 0.15 });
    drawWords(c, W.slice(3), t, 150, 620, { font: F.round(118, 700), size: 118, sung: PAL.tomato, unsung: rgba('ink', 0.18), pop: 0.15 });

    const px = 1340, py = 540, pw = 340, ph = 660;
    const flip = prog(t, down.start - 0.05, down.start + 0.3, ease.inOutCubic);
    const sy = Math.cos(Math.PI * flip);
    const enter = spring(t - t0, 2, 7);
    // notifications: one per hat until the flip, then thrown out, popped on "stop"
    const msgs = ['ping!', '3 new messages', 'sale ends soon', 'someone liked', 'breaking news', 'ping!', 'reminder', 'you have mail'];
    // notifications: one per hat; on the screen until the flip, then they are the noises
    // buzzing round the phone, and they all pop on "stop"
    const born = this.hats.filter((h) => h >= t0 + 0.05 && h < stop.start - 0.05).slice(0, 10);
    const onScreen = born.filter((h) => h < down.start);
    c.save();
    c.translate(px, py + (1 - enter) * 700);
    c.rotate(0.05 + 0.02 * Math.sin(t * 2));
    // phone body
    c.save();
    c.scale(1, Math.abs(sy) < 0.02 ? 0.02 : sy);
    sticker(c, -pw / 2, -ph / 2, pw, ph, sy >= 0 ? PAL.ink : PAL.ink, 48, 12);
    if (sy >= 0) {
      c.fillStyle = PAL.paper2;
      c.beginPath();
      c.roundRect(-pw / 2 + 18, -ph / 2 + 50, pw - 36, ph - 100, 22);
      c.fill();
      c.fillStyle = rgba('ink', 0.5);
      c.font = F.mono(24);
      c.textAlign = 'center';
      c.fillText('09:41', 0, -ph / 2 + 100);
    } else {
      // back: a little tomato logo
      c.scale(1, -1);
      c.fillStyle = PAL.tomato;
      c.beginPath();
      c.arc(0, -ph / 2 + 110, 34, 0, TAU);
      c.fill();
      c.fillStyle = PAL.leaf;
      star(c, 0, -ph / 2 + 80, 22, 0, 5, 0.4);
      c.fill();
    }
    c.restore();
    c.restore();
    born.forEach((h, k) => {
      if (t < h) return;
      const dt = t - h;
      const thrown = h < down.start ? prog(t, down.start, down.start + 0.45, ease.outCubic) : 1;
      const popAt = stop.start + (k % 4) * 0.04;
      if (t > popAt + 0.25) return;
      const ang = -1.75 + ((k * 3) % born.length / Math.max(1, born.length - 1)) * 3.5 + (hash(k) - 0.5) * 0.3;
      const slot = onScreen.filter((o) => o <= t).length - 1 - k;
      const homeX = px, homeY = py - ph / 2 + 180 + Math.max(0, slot) * 92;
      const rr = 330 + 70 * hash(k + 9);
      const awayX = px + Math.cos(ang) * rr * 0.95;
      const awayY = py + Math.sin(ang) * rr * 0.95;
      const x = lerp(homeX, awayX, thrown) + Math.sin(t * 9 + k) * 6 * thrown;
      const y = lerp(homeY, awayY, thrown) + Math.cos(t * 8 + k) * 6 * thrown;
      const s = 1.25 * spring(dt, 3, 8) * (t > popAt ? 1 + 1.5 * prog(t, popAt, popAt + 0.12) : 1);
      const a = t > popAt ? 1 - prog(t, popAt, popAt + 0.25) : 1;
      if (h < down.start && slot > 4 && thrown <= 0) return;
      c.save();
      c.globalAlpha = a;
      c.translate(x, y);
      c.scale(s, s);
      c.rotate((hash(k + 3) - 0.5) * 0.25);
      const label = msgs[k % msgs.length];
      c.font = F.mono(26);
      const tw = c.measureText(label).width + 50;
      sticker(c, -tw / 2, -30, tw, 60, k % 3 === 0 ? PAL.butter : k % 3 === 1 ? PAL.sky : PAL.white, 30, 6);
      c.fillStyle = PAL.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, 0, 2);
      c.restore();
      if (t > popAt && t < popAt + 0.4) {
        const q = prog(t, popAt, popAt + 0.4, ease.outCubic);
        c.fillStyle = PAL.tomato;
        for (let j = 0; j < 6; j++) {
          const aa = (j / 6) * TAU + k;
          star(c, x + Math.cos(aa) * 120 * q, y + Math.sin(aa) * 80 * q, 16 * (1 - q), aa, 4);
          c.fill();
        }
      }
    });
    // Tomo peeks in for the quiet
    const peek = prog(t, stop.start + 0.4, stop.start + 0.9, ease.outBack) - prog(t, t1 - 0.3, t1, ease.inCubic);
    if (peek > 0) drawTomo(c, 330, 1080 + 140 - 250 * peek, 150, { blink: 1, mouth: 'smile', rot: 0.12, shadow: 0, dial: storyTimer(t).left / 1500 });
    // "shh" after the stop
    const shh = prog(t, stop.start + 0.3, stop.start + 0.6, ease.outBack);
    if (shh > 0) {
      c.save();
      c.translate(px, py - ph / 2 - 80);
      c.scale(shh, shh);
      c.font = F.serif(64, 600);
      c.fillStyle = PAL.ink;
      c.textAlign = 'center';
      c.fillText('shh…', 0, 0);
      c.restore();
    }
  }

  // C: "One small tomato on my desk"
  plateC(c: C2D, f: Frame, t0: number, t1: number) {
    const t = f.t;
    const line = this.lines[2];
    const deskY = 780;
    // desk
    c.fillStyle = PAL.paper2;
    c.fillRect(0, deskY, 1920, 300);
    c.fillStyle = dots(c, rgba('tomatoDk', 0.25), 16, 3);
    c.fillRect(0, deskY, 1920, 300);
    c.strokeStyle = PAL.ink;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(0, deskY);
    c.lineTo(1920, deskY);
    c.stroke();
    // mug
    const mx = 420;
    c.lineWidth = 6;
    c.fillStyle = PAL.butter;
    c.beginPath();
    c.roundRect(mx - 80, deskY - 190, 160, 190, [10, 10, 30, 30]);
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(mx + 92, deskY - 100, 40, -Math.PI / 2, Math.PI / 2);
    c.stroke();
    // steam
    c.strokeStyle = rgba('ink', 0.5);
    c.lineWidth = 5;
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let s = 0; s <= 20; s++) {
        const yy = deskY - 210 - s * 7;
        const xx = mx - 40 + k * 40 + Math.sin(s * 0.5 - t * 4 + k) * 10;
        if (s) c.lineTo(xx, yy); else c.moveTo(xx, yy);
      }
      c.stroke();
    }
    // pencil
    c.save();
    c.translate(1480, deskY - 26);
    c.rotate(-0.08);
    c.fillStyle = PAL.butter;
    c.strokeStyle = PAL.ink;
    c.lineWidth = 5;
    c.beginPath();
    c.roundRect(-170, -18, 300, 36, 6);
    c.fill();
    c.stroke();
    c.fillStyle = PAL.paper;
    c.beginPath();
    c.moveTo(130, -18);
    c.lineTo(190, 0);
    c.lineTo(130, 18);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = PAL.tomato;
    c.fillRect(-170, -16, 30, 32);
    c.restore();
    // Tomo bouncing on the kicks
    const k = f.a.kick;
    const hop = Math.abs(Math.sin(Math.PI * f.beatPhase)) * 24 * (1 - k);
    const R = 150;
    const tomato = line.words.find((w) => w.w.startsWith('tomato'))!;
    drawTomo(c, 960, deskY - R * 0.98 - hop, R, {
      sy: 1 - 0.1 * k, sx: 1 + 0.08 * k, mouth: t > tomato.start ? 'grin' : 'smile',
      look: [Math.sin(t * 1.3) * 0.5, -0.3], dial: storyTimer(t).left / 1500,
      blink: (t - t0) % 2.3 < 0.1 ? 1 : 0,
    });
    // the line as a diagram caption with arrows
    const boxes = drawLine(c, line, t, 960, 230, { size: 112, maxW: 1600, align: 'center', unsung: rgba('ink', 0.2), sung: PAL.ink, pop: 0.16 });
    const arrow = (from: { x: number; width: number }, tx: number, ty: number, start: number, color: string) => {
      const p = prog(t, start, start + 0.35, ease.outCubic);
      if (p <= 0) return;
      const sx = from.x + from.width / 2, sy = 270;
      const cx = (sx + tx) / 2 + 80, cy = (sy + ty) / 2 - 20;
      c.strokeStyle = color;
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath();
      const N = 30;
      let ex = sx, ey = sy, px2 = sx, py2 = sy;
      for (let s = 0; s <= N * p; s++) {
        const u = s / N;
        px2 = ex; py2 = ey;
        ex = (1 - u) * (1 - u) * sx + 2 * u * (1 - u) * cx + u * u * tx;
        ey = (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * cy + u * u * ty;
        if (s) c.lineTo(ex, ey); else c.moveTo(ex, ey);
      }
      c.stroke();
      const a = Math.atan2(ey - py2, ex - px2);
      c.beginPath();
      c.moveTo(ex + Math.cos(a + 2.5) * 26, ey + Math.sin(a + 2.5) * 26);
      c.lineTo(ex, ey);
      c.lineTo(ex + Math.cos(a - 2.5) * 26, ey + Math.sin(a - 2.5) * 26);
      c.stroke();
    };
    const bt = boxes.find((b) => b.w.w.startsWith('tomato'))!;
    const bd = boxes.at(-1)!;
    arrow(bt, 1010, deskY - 2 * R - 20, bt.w.start, PAL.tomato);
    arrow(bd, 1250, deskY + 60, bd.w.start, PAL.ink);
  }

  // D: "Do the next thing, forget the rest"
  plateD(c: C2D, f: Frame, t0: number, t1: number) {
    const t = f.t;
    const line = this.lines[3];
    const W = line.words;
    const thing = W.find((w) => w.w.startsWith('thing'))!;
    const forget = W.find((w) => w.w.startsWith('forget'))!;
    const rest = W.at(-1)!;
    const enter = spring(t - t0, 2.2, 7.5);
    const cx = 960, top = 150;
    c.save();
    c.translate(0, (1 - enter) * 900);
    c.translate(cx, 540);
    c.rotate(-0.025);
    c.translate(-cx, -540);
    sticker(c, cx - 430, top, 860, 690, PAL.white, 26, 14);
    c.fillStyle = PAL.ink;
    c.font = F.mono(30);
    c.fillText('TODAY', cx - 370, top + 70);
    c.fillStyle = rgba('tomato', 0.6);
    c.fillRect(cx - 430 + 60, top + 95, 760, 4);
    const rows = ['inbox (214)', 'fix everything', 'plan the whole year', 'learn the piano'];
    // row 1: the next thing
    const ry = top + 200;
    c.strokeStyle = PAL.ink;
    c.lineWidth = 6;
    c.beginPath();
    c.roundRect(cx - 370, ry - 52, 56, 56, 10);
    c.stroke();
    const tick = prog(t, thing.start, thing.start + 0.25, ease.outCubic);
    if (tick > 0) {
      c.strokeStyle = PAL.tomato;
      c.lineWidth = 11;
      c.lineCap = 'round';
      c.beginPath();
      const pts: [number, number][] = [[cx - 362, ry - 30], [cx - 342, ry - 6], [cx - 300, ry - 68]];
      c.moveTo(...pts[0]);
      const seg = tick * 2;
      for (let s = 1; s <= 2; s++) {
        const u = clamp(seg - (s - 1));
        if (u <= 0) break;
        c.lineTo(lerp(pts[s - 1][0], pts[s][0], u), lerp(pts[s - 1][1], pts[s][1], u));
      }
      c.stroke();
    }
    drawWords(c, W.slice(0, 4), t, cx - 285, ry, { font: F.round(74, 600), size: 74, sung: PAL.ink, unsung: rgba('ink', 0.2), pop: 0.12 });
    // the rest: scribbled out on "forget", falling on "rest"
    rows.forEach((r, k) => {
      const y = ry + 115 + k * 95;
      const fall = prog(t, rest.start + k * 0.12, rest.start + k * 0.12 + 0.9, ease.inQuad);
      c.save();
      c.translate(cx - 370, y + fall * 900);
      c.rotate(fall * (k % 2 ? 0.6 : -0.5));
      c.globalAlpha = 1 - fall * 0.3;
      c.strokeStyle = rgba('ink', 0.5);
      c.lineWidth = 5;
      c.beginPath();
      c.roundRect(0, -42, 46, 46, 8);
      c.stroke();
      c.fillStyle = rgba('ink', 0.55);
      c.font = F.mono(40);
      c.fillText(r, 80, 0);
      const sc = prog(t, forget.start + k * 0.08, forget.start + k * 0.08 + 0.3);
      if (sc > 0) {
        c.strokeStyle = PAL.tomato;
        c.lineWidth = 6;
        c.beginPath();
        const wdt = c.measureText(r).width + 30;
        for (let s = 0; s <= 24 * sc; s++) {
          const xx = 66 + (s / 24) * wdt;
          const yy = -14 + Math.sin(s * 2.2) * 9;
          if (s) c.lineTo(xx, yy); else c.moveTo(xx, yy);
        }
        c.stroke();
      }
      c.restore();
    });
    c.restore();
    drawWords(c, W.slice(4), t, 960, 990, { font: F.round(100, 700), size: 100, sung: PAL.tomato, unsung: rgba('ink', 0.18), align: 'center', pop: 0.2 });
    // iris into the chorus: a tomato-red disc grows from Tomo's spot
    const iris = prog(t, t1 - 0.45, t1, ease.inCubic);
    if (iris > 0) {
      c.fillStyle = PAL.tomato;
      c.beginPath();
      c.arc(960, 560, 1150 * iris, 0, TAU);
      c.fill();
    }
    return { zoom: 1 + 0.06 * prog(t, t1 - 2, t1, ease.inCubic) };
  }
}
