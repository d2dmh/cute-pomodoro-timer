// GL plumbing: render targets, fullscreen shader passes, Canvas2D layers and a compositor.
// Scenes lay out in logical 1920x1080 px; SCALE (url ?scale=2) renders at 3840x2160.
import * as THREE from 'three';

export const W = 1920;
export const H = 1080;
export let SCALE = 1;
export let PW = W;
export let PH = H;
export function setScale(s: number) {
  SCALE = s;
  PW = W * s;
  PH = H * s;
}

// Palette (sRGB hex). Used by Canvas2D directly and by GLSL in linear space.
export const PAL = {
  paper: '#FFF3E2',
  paper2: '#F6E3CB',
  tomato: '#FF4B3E',
  tomatoDk: '#C9342B',
  leaf: '#2FA35B',
  leafDk: '#1E7442',
  ink: '#2A1A16',
  butter: '#FFC94A',
  sky: '#9ED8EA',
  blush: '#FF8F87',
  white: '#FFFFFF',
} as const;
export type PalName = keyof typeof PAL;

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function lin(name: PalName | string): [number, number, number] {
  const hex = (name in PAL ? PAL[name as PalName] : name).replace('#', '');
  return [0, 2, 4].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
}
export function rgba(name: PalName, a = 1) {
  const hex = PAL[name].replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

const glslVec = (n: PalName) => `vec3(${lin(n).map((v) => v.toFixed(5)).join(',')})`;
export const GLSL_COMMON = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;      // physical px
uniform float uScale;   // physical px per logical px
#define TAU 6.28318530718
const vec3 C_PAPER = ${glslVec('paper')};
const vec3 C_PAPER2 = ${glslVec('paper2')};
const vec3 C_TOMATO = ${glslVec('tomato')};
const vec3 C_TOMATO_DK = ${glslVec('tomatoDk')};
const vec3 C_LEAF = ${glslVec('leaf')};
const vec3 C_INK = ${glslVec('ink')};
const vec3 C_BUTTER = ${glslVec('butter')};
const vec3 C_SKY = ${glslVec('sky')};
const vec3 C_BLUSH = ${glslVec('blush')};
// logical-px fragment position, y down (matches Canvas2D)
vec2 fragPx() { return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= .5; } return s; }
// anti-aliased step for a signed distance in logical px
float aa(float d) { return clamp(.5 - d * uScale, 0., 1.); }
`;

const VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }
`;

export function makeRT(w = W, h = H, opts: { pxScale?: number } = {}) {
  const s = opts.pxScale ?? SCALE;
  return new THREE.WebGLRenderTarget(Math.round(w * s), Math.round(h * s), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    colorSpace: THREE.NoColorSpace,
  });
}

const quadGeo = new THREE.PlaneGeometry(2, 2);
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export type Uniforms = Record<string, THREE.IUniform>;

/** A fullscreen fragment shader. `frag` gets GLSL_COMMON prepended and writes fragColor. */
export class FSPass {
  mat: THREE.ShaderMaterial;
  scene = new THREE.Scene();
  u: Uniforms;
  constructor(frag: string, uniforms: Uniforms = {}, blending: THREE.Blending = THREE.NoBlending) {
    this.u = { uRes: { value: new THREE.Vector2(PW, PH) }, uScale: { value: SCALE }, ...uniforms };
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: GLSL_COMMON + frag,
      uniforms: this.u,
      depthTest: false,
      depthWrite: false,
      blending,
      transparent: blending !== THREE.NoBlending,
    });
    const m = new THREE.Mesh(quadGeo, this.mat);
    m.frustumCulled = false;
    this.scene.add(m);
  }
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    const t = target as THREE.WebGLRenderTarget | null;
    (this.u.uRes.value as THREE.Vector2).set(t ? t.width : PW, t ? t.height : PH);
    this.u.uScale.value = t ? t.width / W : SCALE;
    r.setRenderTarget(t);
    r.render(this.scene, quadCam);
  }
}

/** A Canvas2D surface in logical px, uploaded as an sRGB texture. */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  constructor(public w = W, public h = H, public scale = SCALE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    // straight alpha: sRGB-decoding premultiplied texels would darken every partial alpha;
    // the compositor premultiplies after the decode, in linear space
    this.tex.premultiplyAlpha = false;
    this.clear();
  }
  clear() {
    const c = this.ctx;
    // full state reset: nothing (textAlign, font, dashes...) may leak from the last frame
    (c as unknown as { reset?: () => void }).reset?.();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  upload() {
    this.tex.needsUpdate = true;
    return this.tex;
  }
}

/** Draws a texture over a target (premultiplied alpha-over, add or multiply). */
export class Compositor {
  passes: Record<string, FSPass> = {};
  constructor() {
    const frag = /* glsl */ `
      uniform sampler2D tex; uniform float opacity; uniform vec3 tint;
      uniform vec2 offset; uniform float zoom;
      void main() {
        vec2 uv = (vUv - .5) / zoom + .5 - offset;
        vec4 c = texture(tex, uv);
        if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) c = vec4(0);
        fragColor = vec4(c.rgb * tint * c.a, c.a) * opacity;
      }`;
    const mk = (b: THREE.Blending, custom?: (m: THREE.ShaderMaterial) => void) => {
      const p = new FSPass(frag, {
        tex: { value: null }, opacity: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) },
        offset: { value: new THREE.Vector2() }, zoom: { value: 1 },
      }, b);
      p.mat.premultipliedAlpha = true;
      custom?.(p.mat);
      return p;
    };
    this.passes.normal = mk(THREE.CustomBlending, (m) => {
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    });
    this.passes.add = mk(THREE.CustomBlending, (m) => {
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
    });
    this.passes.copy = mk(THREE.NoBlending);
  }
  draw(r: THREE.WebGLRenderer, tex: THREE.Texture, target: THREE.WebGLRenderTarget | null,
    o: { mode?: 'normal' | 'add' | 'copy'; opacity?: number; tint?: [number, number, number]; offset?: [number, number]; zoom?: number } = {}) {
    const p = this.passes[o.mode ?? 'normal'];
    p.u.tex.value = tex;
    p.u.opacity.value = o.opacity ?? 1;
    (p.u.tint.value as THREE.Vector3).set(...(o.tint ?? [1, 1, 1]));
    (p.u.offset.value as THREE.Vector2).set((o.offset?.[0] ?? 0) / W, -(o.offset?.[1] ?? 0) / H);
    p.u.zoom.value = o.zoom ?? 1;
    p.render(r, target);
  }
}

export function clearRT(r: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget | null, rgb: [number, number, number] = [0, 0, 0], a = 1) {
  r.setRenderTarget(rt);
  r.setClearColor(new THREE.Color(rgb[0], rgb[1], rgb[2]), a);
  r.clear(true, false, false);
}
