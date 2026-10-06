import * as THREE from 'three';
import type { AudioMap, Lyrics } from './data';
import type { Compositor } from './gl';
import type { PostOpts } from './post';

/** Everything a scene sees about the current moment. All of it is derived from `t`. */
export interface Frame {
  t: number;      // song time, s
  lt: number;     // time since this scene's window started
  p: number;      // 0..1 through the window
  beat: number;   // continuous beat index
  bar: number;    // continuous bar index
  beatPhase: number;
  barPhase: number;
  a: {            // analysis envelopes (0..1) and decaying hits at t
    rms: number; low: number; mid: number; high: number;
    vocals: number; drums: number; bass: number; other: number;
    kick: number; snare: number; hat: number; tick: number; vonset: number;
  };
}

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  comp: Compositor;
  lyrics: Lyrics;
  audio: AudioMap;
  start: number;
  end: number;
  params: Record<string, unknown>;
}

export abstract class Scene {
  constructor(public ctx: SceneCtx) {}
  async init(): Promise<void> {}
  /** Must fully overwrite `out` (linear HDR). May return post-processing overrides. */
  abstract render(f: Frame, out: THREE.WebGLRenderTarget): Partial<PostOpts> | void;
}

export type SceneClass = new (ctx: SceneCtx) => Scene;
