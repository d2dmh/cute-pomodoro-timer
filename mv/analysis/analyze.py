"""Beat grid, downbeats, sections, drum/vocal events and envelopes -> data/audio.json.

    cd mv/analysis && .venv/bin/python analyze.py

Reads the mix (audio/song.wav) for the grid and the sections, and the stems
(song/stems/*.wav) for per-instrument events and envelopes, the way the original
pipeline reads Demucs stems.

- Tempo and beats: librosa's beat tracker on the percussive part of the mix, then a
  least-squares fit of a constant grid (time = offset + i * period) through the
  tracked beats, extended over the whole song (the intro has no kick).
- Downbeats: of the four possible bar phases, the one where the harmony changes
  (chroma novelty) and the low end hits hardest.
- Sections: novelty on beat-synchronous chroma + MFCC + loudness (checkerboard
  kernel), peaks snapped to downbeats; segments labelled by clustering, so repeats
  of the chorus get the same letter.
- Events: kick (< 150 Hz), snare (1-5 kHz), hat (> 7 kHz) onsets from the drum stem,
  tick (the timer's woodblock, 1.3-2.8 kHz, from the "other" stem) and vocal onsets.
- Envelopes at 50 fps, 0..1: rms/low/mid/high of the mix, and the four stems.

If song/truth.json exists, the grid is checked against the composer's tempo.
"""
import json
import os

import librosa
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 22050
HOP = 441  # 20 ms -> 50 fps envelopes
EFPS = SR / HOP


def load(path):
    x, sr = sf.read(path)
    if x.ndim > 1:
        x = x.mean(1)
    return librosa.resample(x, orig_sr=sr, target_sr=SR)


def band(x, lo=None, hi=None):
    if lo and hi:
        sos = signal.butter(4, [lo, hi], "band", fs=SR, output="sos")
    elif lo:
        sos = signal.butter(4, lo, "high", fs=SR, output="sos")
    else:
        sos = signal.butter(4, hi, "low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def onsets(x, delta=0.08, wait=0.07):
    h = 256
    env = librosa.onset.onset_strength(y=x, sr=SR, hop_length=h)
    fr = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=h, delta=delta,
                                    wait=int(wait * SR / h), backtrack=False)
    # keep only onsets that carry real energy (the stems have reverb and spill)
    rms = librosa.feature.rms(y=x, hop_length=h)[0]
    keep = rms[np.minimum(fr + 2, len(rms) - 1)] > 0.08 * rms.max()
    return [round(float(t), 3) for t in librosa.frames_to_time(fr[keep], sr=SR, hop_length=h)]


def envelope(x, gamma=0.6):
    r = librosa.feature.rms(y=x, hop_length=HOP, frame_length=2048)[0]
    r = uniform_filter1d(r, 2)
    r = (r / (np.percentile(r, 99) + 1e-9)).clip(0, 1) ** gamma
    return [round(float(v), 3) for v in r]


def main():
    mix = load(os.path.join(ROOT, "audio", "song.wav"))
    stems = {k: load(os.path.join(ROOT, "song", "stems", f"{k}.wav")) for k in ("vocals", "drums", "bass", "other")}
    dur = len(mix) / SR

    # --- beat grid
    perc = librosa.effects.percussive(mix)
    oenv = librosa.onset.onset_strength(y=perc, sr=SR, hop_length=256)
    tempo, bfr = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=256, start_bpm=120, tightness=400)
    bt = librosa.frames_to_time(bfr, sr=SR, hop_length=256)
    period = float(np.median(np.diff(bt)))
    idx = np.round((bt - bt[0]) / period)
    A = np.vstack([np.ones_like(idx), idx]).T
    (off, period), *_ = np.linalg.lstsq(A, bt, rcond=None)
    off = off - np.floor(off / period) * period  # first grid beat at or after 0
    # nudge the phase to the kick onsets (the tracker sits a few ms late/early)
    kicks = np.array(onsets(band(stems["drums"], hi=150), delta=0.1))
    near = [k - (off + round((k - off) / period) * period) for k in kicks]
    near = [d for d in near if abs(d) < 0.05]
    if near:
        off += float(np.median(near))
    n = int((dur - off) / period) + 1
    beats = off + period * np.arange(n)
    bpm = 60.0 / period

    # --- downbeats: harmony changes on the one; the low end lands there too
    chroma = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(mix), sr=SR, hop_length=512)
    bfr2 = librosa.time_to_frames(beats, sr=SR, hop_length=512).clip(0, chroma.shape[1] - 1)
    cs = librosa.util.sync(chroma, bfr2, aggregate=np.median)
    nov = np.r_[0, np.linalg.norm(np.diff(cs, axis=1), axis=0)][: len(beats)]
    low = librosa.onset.onset_strength(y=band(mix, hi=150), sr=SR, hop_length=512)
    lowb = low[bfr2]
    score = [np.mean(nov[p::4]) / (nov.mean() + 1e-9) + 0.5 * np.mean(lowb[p::4]) / (lowb.mean() + 1e-9) for p in range(4)]
    phase = int(np.argmax(score))
    downbeats = beats[phase::4]

    # --- sections
    mf = librosa.feature.mfcc(y=mix, sr=SR, hop_length=512, n_mfcc=13)
    rmsf = librosa.feature.rms(y=mix, hop_length=512)
    feat = np.vstack([librosa.util.normalize(chroma, axis=0), (mf - mf.mean(1, keepdims=True)) / (mf.std(1, keepdims=True) + 1e-9),
                      3 * rmsf / rmsf.max()])
    dbf = librosa.time_to_frames(downbeats, sr=SR, hop_length=512).clip(0, feat.shape[1] - 1)
    fb = librosa.util.sync(feat, dbf, aggregate=np.mean)  # one column per bar
    # rhythm: the low-end onset strength on each 16th of the bar (four-on-the-floor or not)
    l16 = librosa.time_to_frames(np.arange(0, dur, period / 4), sr=SR, hop_length=512).clip(0, len(low) - 1)
    lv = low[l16][: (len(l16) // 16) * 16].reshape(-1, 16)
    lv = np.pad(lv, ((0, max(0, fb.shape[1] - len(lv))), (0, 0)))[: fb.shape[1]].T
    fb = np.vstack([fb, 2 * lv / (lv.max() + 1e-9)])
    fb = (fb - fb.mean(1, keepdims=True)) / (fb.std(1, keepdims=True) + 1e-9)  # z-score each feature over the song
    fbn = fb / (np.linalg.norm(fb, axis=0, keepdims=True) + 1e-9)
    ssm = fbn.T @ fbn
    k = 4  # bars either side
    kern = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((k, k)))
    pad = np.pad(ssm, k, mode="edge")
    novb = np.array([(pad[i:i + 2 * k, i:i + 2 * k] * kern).sum() for i in range(ssm.shape[0])])
    peaks = signal.find_peaks(novb, distance=2, height=0.35 * novb.max())[0]
    bounds = sorted(set([0] + [int(p) for p in peaks if 0 < p < len(downbeats) - 1]))
    segs = [(bounds[i], bounds[i + 1] if i + 1 < len(bounds) else len(downbeats)) for i in range(len(bounds))]
    means = np.array([fbn[:, a:b].mean(1) for a, b in segs])
    means /= np.linalg.norm(means, axis=1, keepdims=True)
    labels, letters = [], []
    for i, m in enumerate(means):
        for j in range(i):
            if m @ means[j] > 0.8 and abs((segs[i][1] - segs[i][0]) - (segs[j][1] - segs[j][0])) <= 1:
                labels.append(labels[j])
                break
        else:
            labels.append(chr(ord("A") + len(set(labels))))
    sections = []
    for (a, b), lab in zip(segs, labels):
        t0 = float(downbeats[a])
        t1 = float(downbeats[b]) if b < len(downbeats) else dur
        sections.append({"start": round(t0, 3), "end": round(t1, 3), "label": lab,
                         "energy": round(float(rmsf[0, dbf[a]:dbf[min(b, len(dbf) - 1)] or None].mean() / rmsf.max()), 3)})

    # --- events and envelopes
    d = stems["drums"]
    events = {
        "kick": onsets(band(d, hi=150), delta=0.1),
        "snare": onsets(band(d, 1000, 5000), delta=0.12),
        "hat": onsets(band(d, lo=7000), delta=0.05, wait=0.05),
        "tick": onsets(band(stems["other"], 1300, 2800), delta=0.06, wait=0.15),
        "vocal": onsets(stems["vocals"], delta=0.05),
    }
    env = {
        "fps": EFPS,
        "rms": envelope(mix), "low": envelope(band(mix, hi=150)), "mid": envelope(band(mix, 150, 2000)),
        "high": envelope(band(mix, lo=4000)),
        **{k: envelope(v) for k, v in stems.items()},
    }

    out = {
        "duration": round(dur, 3), "bpm": round(bpm, 3), "beat": round(period, 5), "offset": round(float(off), 4),
        "beats": [round(float(b), 3) for b in beats], "downbeats": [round(float(b), 3) for b in downbeats],
        "sections": sections, "events": events, "env": env,
    }
    with open(os.path.join(ROOT, "data", "audio.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"tempo {bpm:.3f} BPM, first beat {off:.3f} s, {len(beats)} beats, downbeat phase {phase}")
    print("sections:", " ".join(f"{s['label']}@{s['start']:.1f}" for s in sections))
    print("events:", {k: len(v) for k, v in events.items()})
    truth_p = os.path.join(ROOT, "song", "truth.json")
    if os.path.exists(truth_p):
        tb = 60.0 / json.load(open(truth_p))["bpm"]
        true_beats = np.arange(0, dur, tb)
        err = np.abs(beats[: len(true_beats)] - true_beats[: len(beats)])
        print(f"check vs composer: tempo error {abs(period - tb) * 1000:.3f} ms/beat, "
              f"beat error max {err.max() * 1000:.1f} ms, downbeats on bars: {bool(np.allclose(downbeats[:5] % (4 * tb), 0, atol=0.03))}")


if __name__ == "__main__":
    main()
