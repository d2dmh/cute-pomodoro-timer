// Intro: the dial is built one tick at a time from the timer ticks the analysis found;
// Tomo drops in on the downbeat, the title arrives on eighth notes, the knob winds to 25:00.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, PAL, rgba } from '../engine/gl';
import { F } from '../engine/type';
import { clamp, ease, prog, spring, TAU, keys } from '../engine/util';
import { drawTomo, paperPass, timerText, bump, sticker } from './_draw';
import { storyTimer } from '../timeline';

const CX = 960, CY = 590, RD = 300;

export default class Intro extends Scene {
  bg = paperPass();
  layer = new Layer2D();
  ticks: number[] = [];
  downs: number[] = [];

  async init() {
    const { audio, start, end } = this.ctx;
    // one mark per beat; it lands on the tick onset the analysis found for that beat
    const ev = audio.events('tick', start - 0.1, end);
    this.ticks = Array.from({ length: 16 }, (_, i) => {
      const b = audio.timeOfBeat(i);
      const hit = ev.find((e) => Math.abs(e - b) < 0.06);
      return hit ?? Math.max(0, b);
    });
    this.downs = audio.downbeats.filter((d) => d >= start && d < end);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    const [, bar1, bar2, bar3] = this.downs; // 2 s, 4 s, 6 s
    const endT = this.ctx.end;
    this.bg.u.dotAmt.value = 0.7;
    this.bg.render(renderer, out);
    const c = this.layer.ctx;
    this.layer.clear();

    // --- the dial, one mark per detected tick
    const nT = this.ticks.filter((x) => x <= t).length;
    c.save();
    c.translate(CX, CY);
    const timer = storyTimer(t);
    // wedge of wound time
    const wound = timer.left / timer.total;
    if (wound > 0) {
      c.fillStyle = rgba('blush', 0.45);
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, RD - 18, -Math.PI / 2, -Math.PI / 2 + TAU * wound);
      c.closePath();
      c.fill();
    }
    for (let i = 0; i < this.ticks.length; i++) {
      const tk = this.ticks[i];
      if (t < tk) break;
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const b = bump(t - tk);
      const long = i % 4 === 0;
      const r0 = RD - (long ? 54 : 30) - 8 * b, r1 = RD + 8 * b;
      c.strokeStyle = PAL.ink;
      c.lineCap = 'round';
      c.lineWidth = long ? 12 : 7;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.stroke();
    }
    // ring appears once the first bar is done
    const ringP = prog(t, bar1 - 0.3, bar1 + 0.4, ease.outCubic);
    if (ringP > 0) {
      c.strokeStyle = PAL.ink;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, RD + 26, -Math.PI / 2, -Math.PI / 2 + TAU * ringP);
      c.stroke();
    }
    // "tick" / "tock" captions at the newest mark
    if (nT > 0 && t < bar2 + 0.2) {
      const i = nT - 1;
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const dt = t - this.ticks[i];
      c.globalAlpha = clamp(1 - dt / 0.45);
      c.fillStyle = i % 2 ? PAL.ink : PAL.tomato;
      c.font = F.mono(30);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const rr = RD + 70 + 20 * ease.outCubic(clamp(dt / 0.4));
      c.fillText(i % 2 ? 'tock' : 'tick', Math.cos(a) * rr, Math.sin(a) * rr);
      c.globalAlpha = 1;
    }
    c.restore();

    // --- Tomo drops in, lands on the downbeat of bar 2
    const drop = bar2 - 0.5;
    if (t >= drop) {
      const fall = prog(t, drop, bar2, ease.inQuad);
      const land = t - bar2;
      const y = CY + 40 - (1 - fall) * 900;
      const sq = land >= 0 ? 1 - 0.28 * Math.exp(-land * 7) * Math.cos(land * 22) : 1 + 0.15 * fall;
      const wind = prog(t, bar3, endT, ease.inOutCubic);
      drawTomo(c, CX, y, 175, {
        sy: sq, sx: 2 - sq,
        blink: keys(t, [[bar2 + 1.2, 0], [bar2 + 1.28, 1], [bar2 + 1.38, 0]]),
        mouth: land < 0 ? 'o' : t > bar3 ? 'grin' : 'smile',
        look: [Math.sin(f.beat * Math.PI) * 0.6 * clamp(land), 0],
        dial: wound,
        knob: -wind * TAU * 1.5,
        shadow: 0.18 * fall,
      });
    }

    // --- title on eighth notes
    const title = 'Little Tomato';
    const tStart = bar2 + 0.5;
    c.font = F.round(128, 700);
    c.textBaseline = 'alphabetic';
    const full = c.measureText(title).width;
    let x = CX - full / 2;
    const ty = 175;
    for (let i = 0; i < title.length; i++) {
      const ch = title[i];
      const w = c.measureText(ch).width;
      const at = tStart + i * 0.125;
      const p = spring(t - at, 2.6, 8);
      if (t >= at && ch !== ' ') {
        c.save();
        c.translate(x + w / 2, ty - (1 - p) * 120);
        c.rotate((1 - p) * 0.4 * (i % 2 ? 1 : -1));
        c.fillStyle = PAL.ink;
        c.fillText(ch, -w / 2 + 5, 7);
        c.fillStyle = i < 6 ? PAL.tomato : PAL.leaf;
        c.fillText(ch, -w / 2, 0);
        c.restore();
      }
      x += w;
    }
    // small print
    const sp = prog(t, bar3 - 0.5, bar3, ease.outCubic);
    if (sp > 0) {
      c.globalAlpha = sp;
      c.fillStyle = PAL.ink;
      c.font = F.mono(26);
      c.textAlign = 'center';
      c.fillText('an original song · synthesized & animated in code', CX, 1000);
      c.globalAlpha = 1;
    }

    // --- readout sticker winds up to 25:00 in the last bar
    if (t >= bar3 - 0.25) {
      const p = prog(t, bar3 - 0.25, bar3, ease.outBack);
      c.save();
      c.translate(CX + RD + 190, CY);
      c.rotate(0.06);
      c.scale(p, p);
      sticker(c, -130, -55, 260, 110, PAL.paper, 22, 9);
      c.font = F.mono(60);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = PAL.tomato;
      c.fillText(timerText(timer.left), 0, 4);
      c.restore();
    }

    comp.draw(renderer, this.layer.upload(), out);
    const push = prog(t, bar3, endT, ease.inExpo);
    return { zoom: 1 + 0.35 * push, flash: 0.0, misreg: 1.4 + 6 * push };
  }
}
