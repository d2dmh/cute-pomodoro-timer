// Bridge: the timer rings (shake, bell arcs on the two rings), the sky turns blue for the
// break, Tomo floats on a cloud, stretches on "Stretch", tea is made, the kettle
// whistles into a white-out that cuts to the night chorus.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, PAL, rgba, lin } from '../engine/gl';
import { F } from '../engine/type';
import type { Line } from '../engine/data';
import { clamp, ease, prog, spring, TAU, hash, noise1, frameIdx } from '../engine/util';
import { drawTomo, drawWords, paperPass, setVec3, sticker, timerText, bump } from './_draw';
import { storyTimer } from '../timeline';

type C2D = CanvasRenderingContext2D;

export default class Bridge extends Scene {
  bg = paperPass();
  layer = new Layer2D();
  ring!: Line;
  stretch!: Line;
  rings: number[] = [];

  async init() {
    const { lyrics } = this.ctx;
    this.ring = lyrics.get('Ring ring');
    this.stretch = lyrics.get('Stretch your arms');
    this.rings = this.ring.words.slice(0, 2).map((w) => w.start);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, start, end } = this.ctx;
    const t = f.t;
    const W = this.ring.words;
    const take = W[2].start;
    const sky = prog(t, take - 0.25, take + 0.35, ease.inOutCubic);
    const mix = (a: [number, number, number], b: [number, number, number]) => a.map((v, i) => v + (b[i] - v) * sky) as [number, number, number];
    setVec3(this.bg.u.colA, mix(lin('butter'), lin('sky')));
    setVec3(this.bg.u.colB, mix(lin('#FFB52E'), lin('#BDE6F2')));
    this.bg.u.dotAmt.value = 1.3;
    this.bg.render(renderer, out);
    const c = this.layer.ctx;
    this.layer.clear();

    const ringing = t < take;
    const ringHit = Math.max(...this.rings.map((r) => (t >= r ? Math.exp(-(t - r) * 5) : 0)));

    // clouds drift in with the break
    if (sky > 0) this.clouds(c, t, sky);

    // the kettle whistle builds in the last bar
    const lastBar = end - 4 * this.ctx.audio.beatLen;
    const whistle = prog(t, lastBar, end, ease.inCubic);

    // Tomo
    const stretchW = this.stretch.words[0];
    const st = t >= stretchW.start ? spring(t - stretchW.start, 1.6, 4) : 0;
    const relax = t >= this.stretch.words.at(-1)!.start ? prog(t, this.stretch.words.at(-1)!.start, this.stretch.words.at(-1)!.start + 0.6) : 0;
    const stretchAmt = st * (1 - relax * 0.6);
    let x = 960, y = 660;
    const R = 190;
    if (ringing) {
      // jumps on each ring, jitters
      const j = ringHit;
      x += noise1(t * 40, 1) * 14 * j;
      y -= 120 * Math.sin(Math.PI * clamp((t - (this.rings.filter((r) => r <= t).at(-1) ?? start)) / 0.45)) * (t >= this.rings[0] ? 1 : 0);
    } else {
      y = 660 + Math.sin(t * 1.6) * 16;
    }
    if (sky > 0) this.cloud(c, x, y + R * 0.95, 1.2 * sky, t);
    drawTomo(c, x, y, R, {
      sy: 1 + 0.22 * stretchAmt, sx: 1 - 0.1 * stretchAmt,
      mouth: ringing ? 'o' : stretchAmt > 0.3 ? 'open' : 'smile',
      blink: ringing ? 0 : 1, arms: ringing ? 0.8 * ringHit : 0.3 + 1.2 * stretchAmt,
      look: ringing ? [0, -1] : [0, 0], dial: storyTimer(t).left / storyTimer(t).total,
      shadow: sky > 0.5 ? 0 : 0.2, rot: ringing ? noise1(t * 30, 3) * 0.08 * ringHit : Math.sin(t * 1.3) * 0.05,
    });

    // bell arcs from the knob on each ring
    for (const r of this.rings) {
      if (t < r || t > r + 0.6) continue;
      const p = (t - r) / 0.6;
      c.strokeStyle = rgba('ink', 1 - p);
      c.lineWidth = 9;
      c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const rr = 60 + k * 50 + p * 220;
        for (const side of [-1, 1]) {
          c.beginPath();
          c.arc(x, y - R * 0.9, rr, -Math.PI / 2 + side * 0.35 - 0.3, -Math.PI / 2 + side * 0.35 + 0.3);
          c.stroke();
        }
      }
    }

    // the lyric: "Ring ring," shouted, "take a break" sighed
    c.save();
    c.shadowColor = PAL.ink;
    c.shadowOffsetX = 7;
    c.shadowOffsetY = 9;
    const ringSize = 132;
    drawWords(c, W.slice(0, 2), t, 960, 200 - 40 * sky, {
      font: F.round(ringSize, 700), size: ringSize, align: 'center', sung: PAL.tomato, unsung: rgba('ink', 0.15),
      pop: 0.35, hop: 0.15, hideUnsung: true,
    });
    c.restore();
    if (t >= take - 0.4) {
      drawWords(c, W.slice(2), t, 960, 300, {
        font: F.serif(110, 600), size: 110, align: 'center', sung: PAL.ink, unsung: rgba('ink', 0.18), pop: 0.1, hop: 0.05,
      });
    }
    if (t >= this.stretch.start - 0.4) {
      const S = this.stretch.words;
      drawWords(c, S.slice(0, 3), t, 420, 860, {
        font: F.serif(84, 600), size: 84, align: 'center', sung: PAL.ink, unsung: rgba('ink', 0.18), pop: 0.25, hop: 0.2,
      });
      drawWords(c, S.slice(3), t, 1500, 860, {
        font: F.serif(84, 600), size: 84, align: 'center', sung: PAL.ink, unsung: rgba('ink', 0.18), pop: 0.25, hop: 0.2,
      });
      const tea = S.find((w) => w.w === 'tea')!;
      this.teacup(c, 1500, 650, t, tea.start, whistle);
    }

    // the readout: 00:00 blinking while it rings, then the break counts down
    const tm = storyTimer(t);
    c.save();
    c.translate(1700, 120);
    c.rotate(0.04);
    const blink = ringing && frameIdx(t) % 12 < 6;
    sticker(c, -130, -48, 260, 96, ringing ? (blink ? PAL.tomato : PAL.paper) : PAL.paper, 20, 8);
    c.font = F.mono(52);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = ringing && blink ? PAL.paper : PAL.ink;
    c.fillText(timerText(ringing ? 0 : tm.left), 0, 3);
    c.restore();

    comp.draw(renderer, this.layer.upload(), out);
    const shake: [number, number] = [noise1(t * 35, 7) * 22 * ringHit + noise1(t * 50, 9) * 6 * whistle, noise1(t * 35, 8) * 18 * ringHit];
    return {
      shake,
      zoom: 1 + 0.05 * ringHit + 0.12 * whistle,
      flash: Math.max(0.18 * ringHit * (ringing ? 1 : 0), prog(t, end - 0.3, end, ease.inQuad)),
      flashColor: lin('paper'),
      misreg: 1.4 + 8 * ringHit,
      vignette: 0.15,
    };
  }

  cloud(c: C2D, x: number, y: number, s: number, t: number) {
    if (s <= 0) return;
    c.save();
    c.translate(x, y);
    c.scale(s, s * 0.7);
    c.fillStyle = PAL.white;
    c.strokeStyle = PAL.ink;
    c.lineWidth = 5;
    const p = new Path2D();
    const bumps: [number, number, number][] = [[-160, 10, 70], [-80, -30, 90], [20, -45, 100], [120, -20, 85], [185, 15, 60]];
    for (const [bx, by, br] of bumps) p.arc(bx, by + Math.sin(t * 2 + bx) * 3, br, 0, TAU);
    p.rect(-200, 0, 400, 60);
    c.fill(p);
    c.restore();
  }

  clouds(c: C2D, t: number, a: number) {
    for (let i = 0; i < 6; i++) {
      const speed = 30 + hash(i) * 40;
      const x = ((hash(i + 10) * 2400 + t * speed) % 2600) - 340;
      const y = 120 + hash(i + 20) * 700;
      c.globalAlpha = 0.85 * a;
      this.cloud(c, x, y, 0.55 + hash(i + 30) * 0.4, t + i);
    }
    c.globalAlpha = 1;
  }

  teacup(c: C2D, x: number, y: number, t: number, at: number, whistle: number) {
    if (t < at - 0.1) return;
    const s = spring(t - at, 2.5, 7);
    c.save();
    c.translate(x, y);
    c.scale(s * 1.4, s * 1.4);
    c.rotate(Math.sin(t * 2) * 0.03);
    c.fillStyle = PAL.paper;
    c.strokeStyle = PAL.ink;
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(-80, -30);
    c.lineTo(80, -30);
    c.quadraticCurveTo(76, 70, 0, 76);
    c.quadraticCurveTo(-76, 70, -80, -30);
    c.fill();
    c.stroke();
    c.fillStyle = PAL.tomato;
    c.beginPath();
    c.arc(0, 18, 18, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(90, 8, 26, -1.2, 1.4);
    c.stroke();
    c.fillStyle = PAL.white;
    c.beginPath();
    c.ellipse(0, 82, 115, 15, 0, 0, TAU);
    c.fill();
    c.stroke();
    // steam: more and faster as the kettle whistles
    c.strokeStyle = rgba('white', 0.95);
    c.lineWidth = 7 + 6 * whistle;
    c.lineCap = 'round';
    const n = 3 + Math.round(whistle * 3);
    for (let k = 0; k < n; k++) {
      c.beginPath();
      const h = 14 + whistle * 18;
      for (let s2 = 0; s2 <= h; s2++) {
        const yy = -45 - s2 * 8;
        const xx = -50 + (k * 100) / Math.max(1, n - 1) + Math.sin(s2 * 0.55 - t * (5 + 10 * whistle) + k) * (8 + 6 * whistle);
        if (s2) c.lineTo(xx, yy); else c.moveTo(xx, yy);
      }
      c.stroke();
    }
    c.restore();
    if (whistle > 0.15) {
      const b = bump(0) + whistle;
      c.save();
      c.translate(x + 160, y - 260);
      c.rotate(0.2);
      c.scale(0.6 + b * 0.6, 0.6 + b * 0.6);
      c.font = F.round(110, 700);
      c.fillStyle = PAL.tomato;
      c.textAlign = 'center';
      c.fillText('!', 0, 0);
      c.restore();
    }
  }
}
