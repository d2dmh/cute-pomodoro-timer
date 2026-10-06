// Outro: the dial and Tomo return, the timer is wound back to 25:00, the title and the
// credits, then everything leaves on the beat (ticks first, Tomo last) so the final
// frame is the bare paper of frame 0 and the video loops.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, PAL, rgba } from '../engine/gl';
import { F } from '../engine/type';
import { clamp, ease, prog, spring, TAU } from '../engine/util';
import { drawTomo, paperPass, timerText, sticker } from './_draw';

const CX = 960, CY = 590, RD = 300;

export default class Outro extends Scene {
  bg = paperPass();
  layer = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio, start } = this.ctx;
    const t = f.t;
    const B = audio.beatLen;
    const lt = t - start;
    this.bg.u.dotAmt.value = 0.7;
    this.bg.render(renderer, out);
    const c = this.layer.ctx;
    this.layer.clear();

    // timeline (beats after the final chord)
    const leave0 = start + 8 * B; // ticks leave one per 8th from here
    const tomoOut = start + 12 * B;
    const textOut = start + 11 * B;

    // dial: all 16 marks back at once on the chord, leaving one per eighth note
    const inP = spring(lt, 2.2, 7);
    c.save();
    c.translate(CX, CY);
    const wound = prog(t, start, start + 2 * B, ease.inOutCubic);
    const wedgeOut = prog(t, leave0 - B, leave0, ease.inCubic);
    if (wound > 0 && wedgeOut < 1) {
      c.fillStyle = rgba('blush', 0.45 * (1 - wedgeOut));
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, RD - 18, -Math.PI / 2, -Math.PI / 2 + TAU * wound);
      c.closePath();
      c.fill();
    }
    for (let i = 0; i < 16; i++) {
      const gone = leave0 + (15 - i) * (B / 2);
      if (t > gone) continue;
      const a = -Math.PI / 2 + (i / 16) * TAU;
      const long = i % 4 === 0;
      const r0 = (RD - (long ? 54 : 30)) * inP, r1 = RD * inP;
      c.strokeStyle = PAL.ink;
      c.lineCap = 'round';
      c.lineWidth = long ? 12 : 7;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.stroke();
    }
    const ringGone = prog(t, leave0, leave0 + 8 * (B / 2), ease.inOutCubic);
    if (ringGone < 1) {
      c.strokeStyle = PAL.ink;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, (RD + 26) * inP, -Math.PI / 2 + TAU * ringGone, -Math.PI / 2 + TAU);
      c.stroke();
    }
    c.restore();

    // Tomo bows on the chord, waves, then hops off the top
    const bow = Math.sin(Math.PI * clamp(lt / (2 * B))) * 0.5;
    const hopOut = prog(t, tomoOut, tomoOut + 2 * B, ease.inBack);
    drawTomo(c, CX, CY + 40 - hopOut * 1100, 175, {
      sy: 1 - 0.25 * bow + 0.15 * hopOut, sx: 1 + 0.1 * bow - 0.08 * hopOut,
      blink: lt > 1.2 && lt < 1.32 ? 1 : bow > 0.2 ? 1 : 0,
      mouth: hopOut > 0 ? 'open' : 'grin', arms: lt > 2 * B && hopOut === 0 ? 0.5 + 0.3 * Math.sin(t * 9) : 0,
      knob: -wound * TAU * 1.5, dial: wound, shadow: 0.18 * (1 - hopOut),
    });

    // title, credits, readout
    const textP = spring(lt - 0.1, 2.4, 8) * (1 - prog(t, textOut, textOut + B, ease.inCubic));
    if (textP > 0.001) {
      c.save();
      c.globalAlpha = clamp(textP);
      c.font = F.round(128, 700);
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      const y = 175 - (1 - textP) * 60;
      c.fillStyle = PAL.ink;
      c.fillText('Little Tomato', CX + 5, y + 7);
      c.fillStyle = PAL.tomato;
      c.fillText('Little ', CX - c.measureText('Tomato').width / 2, y);
      c.fillStyle = PAL.leaf;
      c.fillText('Tomato', CX + c.measureText('Little ').width / 2, y);
      c.font = F.mono(24);
      c.fillStyle = PAL.ink;
      c.fillText('words, music & voice: written and synthesized in code (numpy · pyworld · eSpeak NG)', CX, 990);
      c.fillText('timing: recovered from the audio (librosa · DTW alignment) · picture: three.js + Canvas2D', CX, 1028);
      c.restore();

      c.save();
      c.globalAlpha = clamp(textP);
      c.translate(CX + RD + 190, CY);
      c.rotate(0.06);
      c.scale(textP, textP);
      sticker(c, -130, -55, 260, 110, PAL.paper, 22, 9);
      c.font = F.mono(60);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = PAL.tomato;
      c.fillText(timerText(1500 * wound), 0, 4);
      c.restore();
    }

    comp.draw(renderer, this.layer.upload(), out);
    return { zoom: 1 + 0.03 * Math.exp(-lt * 3) };
  }
}
