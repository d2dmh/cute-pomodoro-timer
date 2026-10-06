// The engine renders any song time t: it picks the timeline entry, builds the Frame,
// averages sub-frames over the shutter for motion blur, and post-processes.
import * as THREE from 'three';
import { AudioMap, Lyrics } from './data';
import { Compositor, clearRT, makeRT, PW, PH } from './gl';
import { Post, POST_DEFAULTS, type PostOpts } from './post';
import type { Frame, Scene, SceneClass } from './scene';
import { FPS, frameIdx } from './util';

export interface Entry {
  name: string;
  load: () => Promise<{ default: SceneClass }>;
  start: number;
  end: number;
  params?: Record<string, unknown>;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  comp = new Compositor();
  post = new Post();
  lyrics = new Lyrics();
  audio = new AudioMap();
  entries: { e: Entry; scene: Scene }[] = [];
  sceneRT = makeRT();
  accumRT = makeRT();
  errors: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
  }

  async load(entries: Entry[], only?: string[]) {
    for (const e of entries) {
      if (only && !only.includes(e.name)) continue;
      const mod = await e.load();
      const scene = new mod.default({
        renderer: this.renderer, comp: this.comp, lyrics: this.lyrics, audio: this.audio,
        start: e.start, end: e.end, params: e.params ?? {},
      });
      await scene.init();
      this.entries.push({ e, scene });
    }
  }

  entryAt(t: number) {
    return this.entries.find(({ e }) => t >= e.start && t < e.end) ??
      (t >= (this.entries.at(-1)?.e.end ?? Infinity) ? this.entries.at(-1) : undefined);
  }

  frame(t: number, e: Entry): Frame {
    const a = this.audio;
    const beat = a.beatAt(t);
    const bar = a.barAt(t);
    return {
      t, lt: t - e.start, p: (t - e.start) / (e.end - e.start),
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: {
        rms: a.env('rms', t), low: a.env('low', t), mid: a.env('mid', t), high: a.env('high', t),
        vocals: a.env('vocals', t), drums: a.env('drums', t), bass: a.env('bass', t), other: a.env('other', t),
        kick: a.hit('kick', t, 0.09), snare: a.hit('snare', t, 0.1), hat: a.hit('hat', t, 0.05),
        tick: a.hit('tick', t, 0.07), vonset: a.hit('vocal', t, 0.1),
      },
    };
  }

  private renderScene(t: number, out: THREE.WebGLRenderTarget): Partial<PostOpts> {
    const hit = this.entryAt(t);
    if (!hit) {
      clearRT(this.renderer, out, [0, 0, 0]);
      return {};
    }
    try {
      return hit.scene.render(this.frame(t, hit.e), out) ?? {};
    } catch (err) {
      const msg = `${hit.e.name} @ ${t.toFixed(3)}: ${(err as Error).stack ?? err}`;
      if (this.errors.length < 20) this.errors.push(msg);
      console.error(msg);
      clearRT(this.renderer, out, [1, 0, 1]);
      return {};
    }
  }

  /**
   * Render song time t to the canvas. With samples > 1 the frame is the average of
   * `samples` sub-frames spread over `shutter` (fraction of the frame time), centred on t.
   */
  render(t: number, opts: { samples?: number; shutter?: number } = {}) {
    const n = Math.max(1, Math.round(opts.samples ?? 1));
    const shutter = opts.shutter ?? 0.5;
    let post: Partial<PostOpts> = {};
    let src = this.sceneRT;
    if (n === 1) {
      post = this.renderScene(t, this.sceneRT);
    } else {
      clearRT(this.renderer, this.accumRT, [0, 0, 0], 0);
      const mid = Math.floor(n / 2);
      for (let k = 0; k < n; k++) {
        const tk = t + ((k + 0.5) / n - 0.5) * (shutter / FPS);
        const o = this.renderScene(tk, this.sceneRT);
        if (k === mid) post = o;
        this.comp.draw(this.renderer, this.sceneRT.texture, this.accumRT, { mode: 'add', opacity: 1 / n });
      }
      src = this.accumRT;
    }
    this.post.render(this.renderer, src, { ...POST_DEFAULTS, ...post }, frameIdx(t));
  }
}
