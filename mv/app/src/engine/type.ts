// Fonts (all SIL OFL, in public/fonts):
//   Fredoka   rounded grotesk, the voice of the lyrics (weights 300-700)
//   Fraunces  soft italic serif, the break / the tender register (weights 100-900)
//   DM Mono   the timer: readouts, labels, small print

export async function loadFonts() {
  const faces = [
    new FontFace('Fredoka', 'url(/fonts/Fredoka.ttf)', { weight: '300 700', stretch: '75% 125%' }),
    new FontFace('Fraunces', 'url(/fonts/Fraunces-Italic.ttf)', { weight: '100 900', style: 'italic' }),
    new FontFace('DM Mono', 'url(/fonts/DMMono-Medium.ttf)', { weight: '500' }),
  ];
  for (const f of faces) {
    await f.load();
    document.fonts.add(f);
  }
  await document.fonts.ready;
}

export const F = {
  round: (px: number, weight = 600) => `${weight} ${px}px Fredoka`,
  serif: (px: number, weight = 500) => `italic ${weight} ${px}px Fraunces`,
  mono: (px: number) => `500 ${px}px "DM Mono"`,
};

export function measure(ctx: CanvasRenderingContext2D, text: string, font: string) {
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Largest size (<= max) at which `text` fits in `width`. */
export function fitSize(ctx: CanvasRenderingContext2D, text: string, width: number, fontAt: (px: number) => string, max = 400) {
  const w = measure(ctx, text, fontAt(100));
  return Math.min(max, (100 * width) / Math.max(1, w));
}
