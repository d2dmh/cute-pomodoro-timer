"""Synthesizes "Little Tomato" from song/score.py: every instrument and the voice.

    cd mv/analysis && uv run --no-project python ../song/compose.py

Writes
  audio/song.wav, audio/song.mp3   the mix the video uses
  song/stems/{vocals,drums,bass,other}.wav   (not committed; the analysis reads them
                                    where the original pipeline would separate stems)
  song/truth.json                   the true word timings, for scoring the aligner only

The singer is eSpeak NG reading each word, re-timed and re-pitched onto the melody
with the WORLD vocoder (pyworld). It is a robot that has learned to sing, which
suits a song sung by a kitchen timer.

Deterministic: same input, same output (seeded noise, no timestamps).
"""
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import pyworld as pw
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import score as S  # noqa: E402

SR = 44100
TAIL = 4.0
LEN = int((S.BARS * S.BAR + TAIL) * SR)
rng = np.random.default_rng(25)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def t_of(bar, beat=0.0):
    return bar * S.BAR + beat * S.BEAT


def track():
    return np.zeros((LEN, 2))


def put(buf, x, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= LEN:
        return
    x = x[: LEN - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if x.ndim == 1:
        buf[i:i + len(x), 0] += x * gain * l * 1.414
        buf[i:i + len(x), 1] += x * gain * r * 1.414
    else:
        buf[i:i + len(x)] += x * gain


def tt(d):
    return np.arange(int(round(d * SR))) / SR


def lp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bp(x, f0, f1, order=2):
    b, a = signal.butter(order, [f0 / (SR / 2), f1 / (SR / 2)], "band")
    return signal.lfilter(b, a, x, axis=0)


def noise(d):
    return rng.standard_normal(int(round(d * SR)))


def saw(f, d, phase=0.0):
    """Band-limited sawtooth (additive)."""
    t = tt(d)
    out = np.zeros_like(t)
    for k in range(1, int(min(40, (SR / 2.2) / f)) + 1):
        out += np.sin(2 * np.pi * k * f * t + phase * k) / k
    return out * (2 / np.pi)


def adsr(n, a=0.005, d=0.1, s=0.6, r=0.05):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    e = np.full(n, s)
    e[:a] = np.linspace(0, 1, a, endpoint=False) if a else e[:a]
    e[a:a + d] = np.linspace(1, s, len(e[a:a + d]))
    if r:
        e[-r:] *= np.linspace(1, 0, len(e[-r:]))
    return e


# --- drums & percussion -------------------------------------------------------

def kick():
    t = tt(0.45)
    f = 46 + 110 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    x[:200] += noise(200 / SR) * np.linspace(0.6, 0, 200)
    return np.tanh(x * 1.6)


def snare():
    t = tt(0.3)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    n = bp(noise(0.3), 1500, 9000) * np.exp(-t / 0.11)
    return 0.6 * body + 0.9 * n


def clap():
    t = tt(0.35)
    env = np.zeros_like(t)
    for o in (0.0, 0.011, 0.023):
        k = int(o * SR)
        env[k:] += np.exp(-(t[: len(t) - k]) / (0.012 if o < 0.02 else 0.13))
    return bp(noise(0.35), 900, 4500) * env * 0.8


def hat(open_=False):
    d = 0.32 if open_ else 0.06
    t = tt(d)
    return hp(noise(d), 7000) * np.exp(-t / (0.12 if open_ else 0.018))


def woodblock(high):
    """The timer's tick (high) and tock (low)."""
    t = tt(0.12)
    f = 2350 if high else 1560
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.71 * t)
    x *= np.exp(-t / (0.022 if high else 0.03))
    x[:60] += noise(60 / SR) * 0.4
    return x


def bell(f, d=2.2, index=2.4):
    """FM bell."""
    t = tt(d)
    mod = index * np.exp(-t / 0.5) * np.sin(2 * np.pi * f * 3.5 * t)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t / (d / 3.2))


def alarm(d=0.95):
    """A mechanical timer bell: inharmonic partials struck ~24 times a second."""
    t = tt(d)
    x = sum(a * np.sin(2 * np.pi * 1870 * p * t) for p, a in ((1, 1), (2.76, .5), (5.4, .25)))
    strike = (0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 24 * t))) * np.exp(-t / 2.0)
    x = lp(x * strike, 9000)
    x *= np.minimum(1, (d - t) / 0.06)
    return x


def riser(d, f0=400, f1=7000):
    n = noise(d)
    t = tt(d)
    out = np.zeros_like(n)
    seg = int(0.05 * SR)
    for i in range(0, len(n), seg):
        fc = f0 * (f1 / f0) ** (i / len(n))
        out[i:i + seg] = bp(n[max(0, i - 2048):i + seg], fc * 0.8, min(fc * 1.25, 20000))[-len(n[i:i + seg]):]
    return out * (t / d) ** 2


def kettle(d):
    t = tt(d)
    f = 1500 + 900 * (t / d) ** 1.5
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / d) ** 1.2
    return x + 0.15 * hp(noise(d), 3000) * (t / d)


# --- pitched -------------------------------------------------------------------

def bass_note(m, d):
    x = lp(saw(hz(m), d), 520 + 300 * 0) * 0.7 + 0.6 * np.sin(2 * np.pi * hz(m) * tt(d))
    return np.tanh(1.4 * x * adsr(len(x), 0.004, 0.18, 0.55, 0.03))


def supersaw(ms, d, cutoff=2600):
    x = np.zeros(int(round(d * SR)))
    for m in ms:
        for det in (-0.12, 0.0, 0.11):
            x += saw(hz(m + det), d, phase=rng.uniform(0, 6.28))
    return lp(x / (len(ms) * 2.2), cutoff) * adsr(len(x), 0.02, 0.3, 0.75, 0.12)


def pluck(m, d=0.6):
    x = saw(hz(m), d) * np.exp(-tt(d) / 0.12)
    return lp(x, 3200) * 0.7


def sidechain(kicks):
    """Gain curve that ducks under every kick."""
    g = np.ones(LEN)
    rel = int(0.22 * SR)
    curve = 1 - 0.65 * np.exp(-np.arange(rel) / (0.06 * SR))
    for k in kicks:
        i = int(k * SR)
        g[i:i + rel] = np.minimum(g[i:i + rel], curve[: len(g[i:i + rel])])
    return g[:, None]


def reverb(x, decay=1.8, wet=0.25, seed=7):
    r = np.random.default_rng(seed)
    n = int(decay * SR)
    t = np.arange(n) / SR
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)], 1) * np.exp(-t / (decay / 6.9))[:, None]
    ir = lp(ir, 6000)
    ir /= np.sqrt((ir ** 2).sum(0))
    y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:LEN] for c in range(2)], 1)
    return x + wet * y


# --- the singer ------------------------------------------------------------------

FS_V = 22050
FP = 5.0  # WORLD frame period, ms


def speak(text):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "w.wav")
        subprocess.run(["espeak-ng", "-v", "en-us+f3", "-s", "165", "-p", "50", "-w", p, text], check=True)
        x, sr = sf.read(p)
    assert sr == FS_V
    x = x.astype(np.float64)
    nz = np.flatnonzero(np.abs(x) > 0.02 * np.abs(x).max())
    return x[max(0, nz[0] - 40): nz[-1] + 40]


def sing(text, pitches, dur):
    """eSpeak says the word; WORLD re-times it to `dur` seconds and sings `pitches`."""
    x = speak(text)
    f0, tf = pw.harvest(x, FS_V, f0_floor=70, f0_ceil=500, frame_period=FP)
    sp = pw.cheaptrick(x, f0, tf, FS_V)
    ap = pw.d4c(x, f0, tf, FS_V)
    n = len(f0)
    v = np.flatnonzero(f0 > 0)
    fv, lv = (v[0], v[-1]) if len(v) else (0, n - 1)
    T = max(8, int(round(dur * 1000 / FP)))
    on, co = fv, n - 1 - lv
    if on + co + 6 > T:  # a fast note: squeeze the whole word
        src = np.linspace(0, n - 1, T)
    else:  # keep the consonants at speaking pace, stretch the vowels
        src = np.concatenate([np.arange(on), np.linspace(fv, lv, T - on - co), np.arange(lv + 1, n)])
    i0 = np.clip(np.floor(src).astype(int), 0, n - 1)
    i1 = np.clip(i0 + 1, 0, n - 1)
    w = (src - i0)[:, None]
    sp2 = np.exp((1 - w) * np.log(sp[i0] + 1e-12) + w * np.log(sp[i1] + 1e-12))
    ap2 = (1 - w) * ap[i0] + w * ap[i1]
    voiced = (f0[i0] > 0) | (f0[i1] > 0)
    # Melody: the pitches spread over the word, glided, with a little late vibrato.
    k = np.minimum((np.arange(T) / T * len(pitches)).astype(int), len(pitches) - 1)
    m = np.array(pitches, float)[k]
    m = np.convolve(np.pad(m, 6, mode="edge"), np.ones(7) / 7, "same")[6:-6]
    tsec = np.arange(T) * FP / 1000
    m += 0.22 * np.clip((tsec - 0.28) / 0.25, 0, 1) * np.sin(2 * np.pi * 5.6 * tsec)
    f0n = np.where(voiced, hz(m), 0.0)
    y = pw.synthesize(f0n, np.ascontiguousarray(sp2), np.ascontiguousarray(ap2), FS_V, FP)
    y = signal.resample_poly(y, 2, 1)
    f = int(0.008 * SR)
    y[:f] *= np.linspace(0, 1, f)
    y[-f:] *= np.linspace(1, 0, f)
    return y / (np.abs(y).max() + 1e-9)


# --- arrangement -----------------------------------------------------------------

def section_of(bar):
    for name, b0, n in S.SECTIONS:
        if b0 <= bar < b0 + n:
            return name
    return "tail"


def build():
    drums, bass, other, vox = track(), track(), track(), track()
    K, SN, CL = kick(), snare(), clap()
    HC, HO = hat(False), hat(True)
    TICK, TOCK = woodblock(True), woodblock(False)
    kicks = []

    def k_at(t, g=1.0):
        put(drums, K, t, 0.95 * g)
        kicks.append(t)

    for bar in range(S.BARS):
        sec = section_of(bar)
        root, tri = S.chord_notes(bar)
        b = lambda beat: t_of(bar, beat)  # noqa: E731
        # The timer: tick on 1 and 3, tock on 2 and 4. Always there, quieter under the band.
        tick_g = {"intro": 0.4, "bridge": 0.32, "outro": 0.36}.get(sec, 0.16)
        if not (sec == "bridge" and bar == 20):
            for beat in range(4):
                put(other, TICK if beat % 2 == 0 else TOCK, b(beat), tick_g, pan=0.35 if beat % 2 == 0 else -0.35)

        if sec == "intro":
            if bar >= 2:  # bell arpeggio
                arp = [tri[0] + 24, tri[1] + 24, tri[2] + 24, tri[1] + 36]
                for i in range(8):
                    put(other, bell(hz(arp[i % 4]), 1.2, 1.6), b(i * 0.5), 0.10, pan=0.3 * np.sin(i))
            if bar == 3:
                put(other, riser(2.0), b(0), 0.35)
                for i in range(8):
                    put(drums, SN, b(2 + i * 0.25), 0.15 + 0.06 * i)
            put(other, supersaw([m + 12 for m in tri], S.BAR, 1400), b(0), 0.10)

        elif sec == "verse":
            k_at(b(0)); k_at(b(1.5), 0.7); k_at(b(2))
            put(drums, SN, b(1), 0.45); put(drums, SN, b(3), 0.45)
            for i in range(8):
                put(drums, HC, b(i * 0.5), 0.10 if i % 2 else 0.16, pan=0.2)
            for i in range(8):
                put(bass, bass_note(root - 12 + (12 if i % 4 == 3 else 0), 0.24), b(i * 0.5), 0.55)
            for i in (0.5, 1.5, 2.5, 3.5):
                for m in tri:
                    put(other, pluck(m + 12, 0.4), b(i), 0.08, pan=-0.3)
            put(other, supersaw([m + 12 for m in tri], S.BAR, 1200), b(0), 0.07)

        elif sec in ("chorus", "chorus2"):
            for beat in range(4):
                k_at(b(beat))
                put(drums, HO, b(beat + 0.5), 0.10, pan=-0.2)
            put(drums, CL, b(1), 0.55); put(drums, CL, b(3), 0.55)
            put(drums, SN, b(1), 0.25); put(drums, SN, b(3), 0.25)
            for i in range(16):
                put(drums, HC, b(i * 0.25), 0.05, pan=0.25)
            for i in range(8):
                put(bass, bass_note(root - 12 + (12 if i % 2 else 0), 0.22), b(i * 0.5), 0.55)
            put(other, supersaw([m + 12 for m in tri] + [tri[0] + 24], S.BAR, 3200), b(0), 0.16)
            if sec == "chorus2":  # bell counter-melody
                for i, d in enumerate((0, 1.5, 3)):
                    put(other, bell(hz(tri[i % 3] + 36), 1.4, 1.2), b(d), 0.07, pan=0.4)
            if bar in (19, 31):
                for i in range(4):
                    put(drums, SN, b(3 + i * 0.25), 0.25 + 0.08 * i)

        elif sec == "bridge":
            if bar == 20:  # ding: the timer is done
                put(other, alarm(0.95), b(0), 0.14, pan=-0.15)
                put(other, alarm(0.95), b(1), 0.14, pan=0.15)
            put(other, supersaw([m + 12 for m in tri], S.BAR, 900), b(0), 0.13)
            put(bass, bass_note(root - 12, S.BAR * 0.95), b(0), 0.4)
            for i in (0, 1.5, 3):
                put(other, bell(hz(tri[int(i) % 3] + 24), 1.6, 1.0), b(i), 0.06, pan=-0.4)
            if bar >= 22:
                put(drums, K, b(0), 0.5)
            if bar == 23:
                put(other, kettle(2.0), b(0), 0.10, pan=0.3)
                put(other, riser(2.0, 300, 9000), b(0), 0.30)
                for i in range(8):
                    put(drums, SN, b(2 + i * 0.25), 0.12 + 0.07 * i)

        elif sec == "outro":
            if bar == 32:
                k_at(b(0))
                put(drums, CL, b(0), 0.5)
                put(other, supersaw([m + 12 for m in tri] + [tri[0] + 24], S.BAR * 2, 2400), b(0), 0.16)
                put(bass, bass_note(root - 12, S.BAR * 1.5), b(0), 0.5)
            if bar == 33:
                put(other, alarm(0.6), b(3), 0.12)
            for i in range(4):
                put(other, bell(hz([72, 76, 79, 84][i]), 2.0, 1.4), b(i * 0.5 + (2 if bar == 33 else 0)), 0.06)

    # The voice.
    truth = []
    for bar, text, words in S.lines():
        line = {"text": text, "words": []}
        for i, (w, beat, beats, pitches) in enumerate(words):
            t0 = t_of(bar, beat)
            nxt = words[i + 1][1] if i + 1 < len(words) else beat + beats
            dur = min(beats, nxt - beat) * S.BEAT - 0.03
            y = sing(S.sung_text(w), pitches, dur)
            put(vox, y, t0, 0.32)
            line["words"].append({"w": w, "start": round(t0, 4), "end": round(t0 + len(y) / SR, 4)})
        line["start"], line["end"] = line["words"][0]["start"], line["words"][-1]["end"]
        truth.append(line)

    vox = hp(vox, 140)
    dbl = np.roll(vox, int(0.014 * SR), axis=0) * 0.35
    vox = vox + np.stack([dbl[:, 0], -dbl[:, 1] * 0.0 + dbl[:, 1] * 0.6], 1)
    vox = reverb(vox, 2.2, 0.22, seed=1)
    other = reverb(other, 1.8, 0.28, seed=2)
    drums = reverb(drums, 0.9, 0.08, seed=3)

    vox *= 3.2
    drums *= 0.7
    sc = sidechain(kicks)
    bass *= sc
    other *= 0.6 + 0.4 * sc
    stems = {"vocals": vox, "drums": drums, "bass": bass, "other": other}
    mix = sum(stems.values())
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    peak = np.abs(mix).max()
    g = 0.89 / peak
    return {k: v * g for k, v in stems.items()}, mix * g, truth


def main():
    stems, mix, truth = build()
    os.makedirs(os.path.join(HERE, "stems"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "audio"), exist_ok=True)
    for k, v in stems.items():
        sf.write(os.path.join(HERE, "stems", f"{k}.wav"), v.astype(np.float32), SR)
    wav = os.path.join(ROOT, "audio", "song.wav")
    sf.write(wav, mix.astype(np.float32), SR, subtype="PCM_16")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libmp3lame", "-b:a", "192k",
                    "-map_metadata", "-1", "-fflags", "+bitexact", os.path.join(ROOT, "audio", "song.mp3")],
                   check=True)
    with open(os.path.join(HERE, "truth.json"), "w") as f:
        json.dump({"bpm": S.BPM, "lines": truth}, f, indent=1, ensure_ascii=False)
    print(f"song: {len(mix) / SR:.1f} s, {sum(len(l['words']) for l in truth)} sung words")


if __name__ == "__main__":
    main()
