// Post-processing: bloom, print misregistration, paper fibre, grain, vignette,
// camera shake/zoom/rotation, flashes and fades, then linear -> sRGB.
import * as THREE from 'three';
import { FSPass, makeRT, W, H, lin } from './gl';

export interface PostOpts {
  exposure: number;
  bloom: number;          // amount of bloom added
  bloomThreshold: number; // linear luminance where bloom starts
  misreg: number;         // print misregistration, logical px between colour plates
  grain: number;
  paper: number;          // paper fibre strength
  vignette: number;
  flash: number;          // 0..1 mix towards flashColor
  flashColor: [number, number, number];
  fade: number;           // 0..1 mix towards fadeColor
  fadeColor: [number, number, number];
  shake: [number, number]; // logical px
  zoom: number;
  rot: number;            // radians
}

export const POST_DEFAULTS: PostOpts = {
  exposure: 1,
  bloom: 0.35,
  bloomThreshold: 0.92,
  misreg: 1.4,
  grain: 0.045,
  paper: 1,
  vignette: 0.22,
  flash: 0,
  flashColor: lin('paper'),
  fade: 0,
  fadeColor: lin('ink'),
  shake: [0, 0],
  zoom: 1,
  rot: 0,
};

export class Post {
  bright: FSPass;
  down: FSPass;
  up: FSPass;
  final: FSPass;
  levels: THREE.WebGLRenderTarget[] = [];
  constructor() {
    for (let i = 1; i <= 6; i++) this.levels.push(makeRT(Math.ceil(W / 2 ** i), Math.ceil(H / 2 ** i), { pxScale: 1 }));
    this.bright = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform float threshold;
      void main() {
        vec3 c = texture(src, vUv).rgb;
        float l = max(c.r, max(c.g, c.b));
        float k = clamp((l - threshold) / 0.35, 0., 1.);
        fragColor = vec4(c * k * k, 1.);
      }`, { src: { value: null }, threshold: { value: 1 } });
    this.down = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel;
      void main() {
        vec3 c = texture(src, vUv).rgb * 4.;
        c += texture(src, vUv + texel * vec2(-1, -1)).rgb + texture(src, vUv + texel * vec2(1, -1)).rgb;
        c += texture(src, vUv + texel * vec2(-1, 1)).rgb + texture(src, vUv + texel * vec2(1, 1)).rgb;
        fragColor = vec4(c / 8., 1.);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel;
      void main() {
        vec3 c = vec3(0);
        c += texture(src, vUv + texel * vec2(-1, 0)).rgb * 2. + texture(src, vUv + texel * vec2(1, 0)).rgb * 2.;
        c += texture(src, vUv + texel * vec2(0, -1)).rgb * 2. + texture(src, vUv + texel * vec2(0, 1)).rgb * 2.;
        c += texture(src, vUv + texel * vec2(-1, -1)).rgb + texture(src, vUv + texel * vec2(1, -1)).rgb;
        c += texture(src, vUv + texel * vec2(-1, 1)).rgb + texture(src, vUv + texel * vec2(1, 1)).rgb;
        fragColor = vec4(c / 12., 1.);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() } }, THREE.AdditiveBlending);
    this.final = new FSPass(/* glsl */ `
      uniform sampler2D scene, bloomTex;
      uniform float exposure, bloom, misreg, grain, paper, vignette, flash, fade, zoom, rot, frame;
      uniform vec3 flashColor, fadeColor;
      uniform vec2 shake;
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      vec3 shoulder(vec3 c) { return mix(c, .8 + .2 * (1. - exp(-(c - .8) / .2)), step(.8, c)); }
      vec2 xf(vec2 uv) {
        vec2 p = (uv - .5) * vec2(${(W / H).toFixed(6)}, 1.);
        float s = sin(-rot), co = cos(-rot);
        p = mat2(co, -s, s, co) * p / zoom;
        return p / vec2(${(W / H).toFixed(6)}, 1.) + .5 - shake / vec2(${W}., -${H}.);
      }
      void main() {
        vec2 uv = xf(vUv);
        vec2 d = vec2(misreg / ${W}., misreg * .55 / ${H}.);
        vec3 c = vec3(texture(scene, uv + d).r, texture(scene, uv).g, texture(scene, uv - d).b);
        c *= exposure;
        c += texture(bloomTex, uv).rgb * bloom;
        vec2 px = fragPx();
        float fib = fbm(px * vec2(.013, .09)) + .5 * fbm(px * vec2(.09, .02) + 7.);
        c *= 1. - paper * .045 * fib;
        vec2 q = vUv - .5;
        c *= 1. - vignette * dot(q, q) * 1.8;
        c = mix(c, flashColor, flash);
        c = mix(c, fadeColor, fade);
        vec3 s = toSRGB(clamp(shoulder(c), 0., 1.));
        float n = hash12(floor(px * 1.25) + frame * vec2(17.13, 31.71)) - .5;
        s += grain * n * (.55 + .45 * (1. - s));
        s += (hash12(gl_FragCoord.xy + frame * 3.1) - .5) / 255.;
        fragColor = vec4(s, 1.);
      }`, {
      scene: { value: null }, bloomTex: { value: null }, exposure: { value: 1 }, bloom: { value: 0 },
      misreg: { value: 0 }, grain: { value: 0 }, paper: { value: 0 }, vignette: { value: 0 },
      flash: { value: 0 }, fade: { value: 0 }, zoom: { value: 1 }, rot: { value: 0 }, frame: { value: 0 },
      flashColor: { value: new THREE.Vector3() }, fadeColor: { value: new THREE.Vector3() }, shake: { value: new THREE.Vector2() },
    });
  }

  render(r: THREE.WebGLRenderer, src: THREE.WebGLRenderTarget, o: PostOpts, frame: number) {
    // bloom pyramid
    this.bright.u.src.value = src.texture;
    this.bright.u.threshold.value = o.bloomThreshold;
    this.bright.render(r, this.levels[0]);
    for (let i = 1; i < this.levels.length; i++) {
      this.down.u.src.value = this.levels[i - 1].texture;
      (this.down.u.texel.value as THREE.Vector2).set(1 / this.levels[i - 1].width, 1 / this.levels[i - 1].height);
      this.down.render(r, this.levels[i]);
    }
    for (let i = this.levels.length - 1; i > 0; i--) {
      this.up.u.src.value = this.levels[i].texture;
      (this.up.u.texel.value as THREE.Vector2).set(1 / this.levels[i].width, 1 / this.levels[i].height);
      this.up.render(r, this.levels[i - 1]);
    }
    const u = this.final.u;
    u.scene.value = src.texture;
    u.bloomTex.value = this.levels[0].texture;
    for (const k of ['exposure', 'bloom', 'misreg', 'grain', 'paper', 'vignette', 'flash', 'fade', 'zoom', 'rot'] as const) u[k].value = o[k];
    u.frame.value = frame % 1000;
    (u.flashColor.value as THREE.Vector3).set(...o.flashColor);
    (u.fadeColor.value as THREE.Vector3).set(...o.fadeColor);
    (u.shake.value as THREE.Vector2).set(...o.shake);
    this.final.render(r, null);
  }
}
