// Entry point: the live preview, and the frame server used by scripts/render.ts.
import songUrl from '../../audio/song.mp3?url';
import { Engine } from './engine/engine';
import { setScale, PW, PH } from './engine/gl';
import { loadFonts } from './engine/type';
import { clamp, setFPS } from './engine/util';
import { TIMELINE } from './timeline';

const q = new URLSearchParams(location.search);
setScale(Number(q.get('scale') ?? 1));
setFPS(Number(q.get('fps') ?? 60));
const headless = q.has('render');
const only = q.get('only')?.split(',');

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = PW;
canvas.height = PH;

declare global {
  interface Window { __mv?: { ready: boolean; errors: string[]; duration: number } }
}

async function boot() {
  await loadFonts();
  const engine = new Engine(canvas);
  await engine.load(TIMELINE, only);
  const duration = engine.audio.duration;
  if (headless) return serve(engine, duration);
  preview(engine, duration);
}

/** Headless: render frames on request over a WebSocket and send back raw RGBA. */
function serve(engine: Engine, duration: number) {
  const gl = engine.renderer.getContext();
  const buf = new Uint8Array(PW * PH * 4 + 8);
  const ws = new WebSocket(`ws://127.0.0.1:${q.get('ws')}`);
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (ev) => {
    const job = JSON.parse(ev.data as string) as { id: number; t: number; samples: number; shutter: number };
    engine.render(job.t, { samples: job.samples, shutter: job.shutter });
    gl.readPixels(0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, buf.subarray(8));
    new DataView(buf.buffer).setFloat64(0, job.id, true);
    ws.send(buf);
  };
  ws.onopen = () => (window.__mv = { ready: true, errors: engine.errors, duration });
}

function preview(engine: Engine, duration: number) {
  const ui = document.getElementById('ui')!;
  const audio = new Audio(songUrl);
  audio.preload = 'auto';
  let t = Number(q.get('t') ?? 0);
  let playing = false;
  let loop: [number, number] | null = null;
  let last = performance.now();
  const fps = 60;
  const entryIdx = () => TIMELINE.findIndex((e) => t >= e.start && t < e.end);
  const seek = (to: number) => {
    t = clamp(to, 0, duration - 1e-3);
    audio.currentTime = t;
  };
  const toggle = async () => {
    playing = !playing;
    if (playing) {
      audio.currentTime = t;
      await audio.play().catch(() => (playing = false));
    } else audio.pause();
  };
  addEventListener('keydown', (e) => {
    const big = e.shiftKey ? 5 : 1;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') seek(t + big);
    else if (e.key === 'ArrowLeft') seek(t - big);
    else if (e.key === '.') seek(t + 1 / fps);
    else if (e.key === ',') seek(t - 1 / fps);
    else if (e.key === ']') seek(TIMELINE[Math.min(TIMELINE.length - 1, entryIdx() + 1)].start);
    else if (e.key === '[') seek(TIMELINE[Math.max(0, entryIdx() - (t - TIMELINE[entryIdx()].start < 0.5 ? 1 : 0))].start);
    else if (e.key === 'l') {
      const en = TIMELINE[entryIdx()];
      loop = loop ? null : [en.start, en.end];
    } else if (e.key === 'h') ui.classList.toggle('hidden');
  });
  canvas.addEventListener('click', toggle);
  const tick = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    if (playing) {
      t = audio.currentTime;
      if (loop && t >= loop[1]) seek(loop[0]);
      if (audio.ended) playing = false;
    }
    const r0 = performance.now();
    engine.render(t);
    const ms = performance.now() - r0;
    const en = TIMELINE[entryIdx()];
    ui.textContent = `${t.toFixed(2)} s  ${en?.name ?? '-'}${loop ? ' (loop)' : ''}  ${ms.toFixed(1)} ms  ${(1 / Math.max(dt, 1e-3)).toFixed(0)} fps\n` +
      `space play · ←/→ ±1 s (shift ±5) · ,/. frame · [/] scene · l loop · h hide`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66">${(e as Error).stack}</pre>`);
});
