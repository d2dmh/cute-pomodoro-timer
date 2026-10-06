# Little Tomato — treatment & style bible

## The idea

A 72-second pop song sung by a kitchen timer. One pomodoro is compressed into the song: the
intro winds the timer to 25:00, the verse and first chorus run it down (the readout on every
timer in the video is the same story clock, `storyTimer()` in `src/timeline.ts`), it rings
at exactly the moment the bridge starts, a 5:00 break runs through the bridge and the night
chorus, and the outro winds it back to 25:00 and clears the page, so the last frame is the
first frame and the video loops.

## Tomo

The mascot is an original design: a round tomato whose leaf cap is the timer knob and whose
belly band is the dial (the band empties as the story clock runs down). Simple face: two
oval eyes with a highlight, blush, a small mouth; closed eyes read as a happy `^ ^`.
Squash and stretch on every kick, hops on the beat grid, bows at the end. Drawn by one
function, `drawTomo()` in `src/scenes/_draw.ts`, so it is identical everywhere.

## Look

- **Print-shop / sticker.** Cream paper, flat colour, thick ink outlines, hard offset
  shadows on stickers and type, halftone dots, a little colour-plate misregistration and
  paper fibre in post. No gradients except the soft shading on Tomo.
- **Palette** (`PAL` in `src/engine/gl.ts`): paper `#FFF3E2`, paper2 `#F6E3CB`, tomato
  `#FF4B3E`, tomatoDk `#C9342B`, leaf `#2FA35B`, ink `#2A1A16`, butter `#FFC94A`, sky
  `#9ED8EA` (owned by the break), blush `#FF8F87`.
- **Light/dark rhythm.** Paper (intro, verse) → red sunburst (chorus) → butter flash, then
  sky (bridge) → night sunburst with butter twinkles (chorus 2) → paper (outro).

## Type

- **Fredoka** (rounded, 600–700): the singing voice.
- **Fraunces italic**: the break, the soft register ("take a break", "Stretch your arms").
- **DM Mono**: the timer: readouts, labels, to-do items, credits.

## Karaoke rules

- Every word appears or lights up exactly at its aligned `start` (`Lyrics.wordProgress`);
  words may be shown dim up to ~0.35 s early, never lit early.
- A word that starts gets a small spring "bump" (scale + hop), so the text dances with the voice.
- Each plate stages the line differently: a caption under a readout, two rows next to a
  phone, a diagram label with arrows, a handwritten to-do item, a shout plus a sigh.

## Edit

Scene windows are anchored to lyric lines and snapped to detected downbeats; inside the
verse every line is a hard cut on its downbeat. Transitions are staged inside scenes:
the verse ends on a tomato-red iris into the red chorus; the bridge ends on a kettle-whistle
white-out into the night chorus.

| time | plate | what happens |
|---|---|---|
| 0–8 | intro | dial built one mark per detected tick; Tomo drops in on bar 2; title on eighths; knob winds to 25:00, push in |
| 8–12 | verse A | giant countdown readout + progress bar, Tomo peeking |
| 12–16 | verse B | notifications pop on the hats, phone flips face down on "down", the noises pop on "stop" |
| 16–20 | verse C | Tomo on the desk, labelled like a diagram (arrows on "tomato" and "desk") |
| 20–24 | verse D | to-do list: tick on "thing", scribble on "forget", items fall on "rest"; red iris |
| 24–40 | chorus | sunburst; TICK/TOCK bubbles on the ticks; beat countdown; pomodoro tokens; confetti on the held last word |
| 40–48 | bridge | two rings: shake, bell arcs, 00:00 blinking; sky, clouds; stretch; tea; kettle white-out |
| 48–64 | chorus 2 | night variant, the break timer running |
| 64–72 | outro | dial, title, credits, 25:00; everything leaves on the beat; bare paper = frame 0 |
