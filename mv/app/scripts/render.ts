// Offline renderer: headless Chromium renders exact frames, ffmpeg encodes them.
//
//   bun scripts/render.ts video  [--from 0 --to 72] [--fps 60] [--samples 1] [--shutter 0.5]
//                                [--scale 1] [--crf 18] [--preset medium] [--workers 2] --out ../out/mv.mp4
//   bun scripts/render.ts stills --t 3,12.5,40.2 [--out ../out/stills]
//   bun scripts/render.ts sheet  --from 8 --to 24 --n 16 [--cols 4] --out ../out/sheet.png
//   bun scripts/render.ts perf   [--from 0 --to 72 --n 24]
//   common: --only intro,verse   --url http://localhost:5173 (use a running server)
//           --chrome /path/to/chrome   --gl gpu|swiftshader
//
// Frames travel page -> this script over a WebSocket as raw RGBA (bottom-up rows,
// flipped by ffmpeg); several pages render in parallel and frames are reordered.
import { chromium, type Browser } from 'playwright-core';
import { createServer, type ViteDevServer } from 'vite';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ServerWebSocket } from 'bun';

const APP = resolve(import.meta.dir, '..');
const ROOT = resolve(APP, '..');
const argv = process.argv.slice(2);
const mode = argv[0] ?? 'video';
const arg = (k: string, d?: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const num = (k: string, d: number) => Number(arg(k, String(d)));

const fps = num('fps', 60);
const scale = num('scale', 1);
const samples = num('samples', 1);
const shutter = num('shutter', 0.5);
const workers = num('workers', 2);
const W = 1920 * scale, H = 1080 * scale;
// the lossless mix if the song was synthesized locally, else the committed mp3
const AUDIO = existsSync(join(ROOT, 'audio', 'song.wav')) ? join(ROOT, 'audio', 'song.wav') : join(ROOT, 'audio', 'song.mp3');

function findChrome(): string | undefined {
  if (arg('chrome')) return arg('chrome');
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    for (const d of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      for (const p of ['chrome-linux/chrome', 'chrome-linux64/chrome']) if (existsSync(join(base, d, p))) return join(base, d, p);
    }
  }
  return undefined;
}

type Job = { id: number; t: number };
type Worker = { ws: ServerWebSocket<unknown>; busy: boolean; resolve?: (b: Uint8Array) => void };

async function main() {
  let vite: ViteDevServer | undefined;
  let url = arg('url');
  if (!url) {
    vite = await createServer({ root: APP, configFile: join(APP, 'vite.config.ts'), logLevel: 'error', server: { port: 5190, hmr: false } });
    await vite.listen();
    url = vite.resolvedUrls!.local[0];
  }

  const pool: Worker[] = [];
  let onConnect: (() => void) | undefined;
  const wss = Bun.serve({
    port: 0,
    fetch(req, srv) {
      if (srv.upgrade(req)) return;
      return new Response('mv render', { status: 200 });
    },
    websocket: {
      maxPayloadLength: W * H * 4 + 64,
      open(ws) {
        pool.push({ ws, busy: false });
        onConnect?.();
      },
      message(ws, msg) {
        const w = pool.find((p) => p.ws === ws)!;
        const r = w.resolve;
        w.resolve = undefined;
        w.busy = false;
        r?.(msg as Uint8Array);
      },
    },
  });

  const useGpu = (arg('gl') ?? (process.platform === 'linux' && !existsSync('/dev/dri') ? 'swiftshader' : 'gpu')) === 'gpu';
  const exe = findChrome();
  const browser: Browser = await chromium.launch({
    executablePath: exe,
    channel: exe ? undefined : 'chrome',
    headless: true,
    args: [
      ...(useGpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    ],
  });
  const nWorkers = mode === 'stills' || mode === 'perf' ? 1 : workers;
  const errors: string[] = [];
  for (let i = 0; i < nWorkers; i++) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    const connected = new Promise<void>((r) => (onConnect = r));
    const only = arg('only') ? `&only=${arg('only')}` : '';
    await page.goto(`${url}?render=1&ws=${wss.port}&scale=${scale}&fps=${fps}${only}`);
    await Promise.race([
      connected,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`page did not start:\n${errors.join('\n')}`)), 180_000)),
    ]);
  }

  const renderOne = (w: Worker, job: Job) =>
    new Promise<Uint8Array>((res) => {
      w.busy = true;
      w.resolve = (b) => res(b.subarray(8));
      w.ws.send(JSON.stringify({ ...job, samples, shutter }));
    });

  /** Renders jobs on all workers, calls `sink` in job order. */
  async function run(jobs: Job[], sink: (px: Uint8Array, job: Job) => Promise<void> | void) {
    const done = new Map<number, Uint8Array>();
    let next = 0, written = 0;
    const t0 = performance.now();
    let flushing = Promise.resolve();
    const flush = async () => {
      while (done.has(written)) {
        const px = done.get(written)!;
        done.delete(written);
        await sink(px, jobs[written]);
        written++;
        if (written % 30 === 0 || written === jobs.length) {
          const el = (performance.now() - t0) / 1000;
          const rate = written / el;
          process.stdout.write(`\r  ${written}/${jobs.length} frames  ${rate.toFixed(2)} fps  ETA ${((jobs.length - written) / rate / 60).toFixed(1)} min   `);
        }
      }
    };
    await Promise.all(pool.slice(0, nWorkers).map(async (w) => {
      while (next < jobs.length) {
        const i = next++;
        // keep the reorder buffer bounded
        while (done.size > 24) await new Promise((r) => setTimeout(r, 5));
        const px = await renderOne(w, jobs[i]);
        done.set(i, new Uint8Array(px));
        flushing = flushing.then(flush);
      }
    }));
    await flushing;
    await flush();
    process.stdout.write('\n');
  }

  const ff = (args: string[]) =>
    Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, ...args], {
      stdin: 'pipe', stdout: 'inherit', stderr: 'inherit',
    });

  if (mode === 'video') {
    const from = num('from', 0), to = num('to', 72);
    const out = resolve(arg('out', join(ROOT, 'out', 'mv.mp4'))!);
    mkdirSync(dirname(out), { recursive: true });
    const n = Math.round((to - from) * fps);
    const jobs = Array.from({ length: n }, (_, i) => ({ id: i, t: from + i / fps }));
    const p = ff([
      '-r', String(fps), '-i', 'pipe:0', '-ss', String(from), '-t', String(to - from), '-i', AUDIO,
      '-vf', 'vflip', '-c:v', 'libx264', '-preset', arg('preset', 'medium')!, '-crf', arg('crf', '18')!, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out,
    ]);
    console.log(`video ${from}-${to} s, ${n} frames at ${fps} fps, ${W}x${H}, ${samples} sample(s), ${nWorkers} worker(s), ${useGpu ? 'gpu' : 'swiftshader'}`);
    await run(jobs, async (px) => {
      p.stdin.write(px);
      await p.stdin.flush();
    });
    p.stdin.end();
    await p.exited;
    console.log(`wrote ${out}`);
  } else if (mode === 'stills') {
    const ts = (arg('t') ?? '1').split(',').map(Number);
    const dir = resolve(arg('out', join(ROOT, 'out', 'stills'))!);
    mkdirSync(dir, { recursive: true });
    await run(ts.map((t, i) => ({ id: i, t })), async (px, job) => {
      const file = join(dir, `t${job.t.toFixed(2).padStart(6, '0')}.png`);
      const p = ff(['-i', 'pipe:0', '-vf', 'vflip', '-frames:v', '1', file]);
      p.stdin.write(px);
      p.stdin.end();
      await p.exited;
      console.log(`  ${file}`);
    });
  } else if (mode === 'sheet') {
    const from = num('from', 0), to = num('to', 8), n = num('n', 16), cols = num('cols', 4);
    const rows = Math.ceil(n / cols);
    const out = resolve(arg('out', join(ROOT, 'out', 'sheet.png'))!);
    mkdirSync(dirname(out), { recursive: true });
    const tile = 480;
    const p = ff(['-i', 'pipe:0', '-vf', `vflip,scale=${tile}:-1,drawbox=c=black@0.0,tile=${cols}x${rows}:padding=6:color=0x222222`, '-frames:v', '1', out]);
    const ts = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / Math.max(1, n - 1));
    await run(ts.map((t, i) => ({ id: i, t })), async (px) => {
      p.stdin.write(px);
      await p.stdin.flush();
    });
    p.stdin.end();
    await p.exited;
    console.log(`wrote ${out} (${ts.map((t) => t.toFixed(2)).join(', ')})`);
  } else if (mode === 'perf') {
    const from = num('from', 0), to = num('to', 72), n = num('n', 24);
    const ts = Array.from({ length: n }, (_, i) => from + ((to - from) * i) / n);
    const times: number[] = [];
    for (const [i, t] of ts.entries()) {
      const a = performance.now();
      await renderOne(pool[0], { id: i, t });
      times.push(performance.now() - a);
      console.log(`  t=${t.toFixed(2)}  ${times.at(-1)!.toFixed(0)} ms`);
    }
    console.log(`mean ${(times.reduce((a, b) => a + b) / times.length).toFixed(0)} ms/frame`);
  }

  const pageErrs = await (async () => errors)();
  if (pageErrs.length) console.log(`PAGE ERRORS:\n${[...new Set(pageErrs)].slice(0, 20).join('\n')}`);
  await browser.close();
  wss.stop(true);
  await vite?.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
