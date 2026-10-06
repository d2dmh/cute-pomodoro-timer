"""Word-level lyric alignment: data/lyrics.src.json + the vocal stem -> data/lyrics.json.

    cd mv/analysis && uv run --no-project python align.py     (or .venv/bin/python align.py)

Neural aligners (CTC models, Whisper) need weights this environment cannot download,
so this is the classic text-to-speech + DTW forced aligner (the idea behind aeneas):

1. Reference. eSpeak NG reads each lyric word in a plain *speaking* voice that is not
   the singer's (male, other speed, no melody); the words are joined with 40 ms
   gaps, so the word boundaries inside the reference are known exactly.
2. Phrase. Each line starts at the vocal onset within ±1.2 s of its rough time
   (lyrics.src.json) with the biggest jump in level; it ends at the next line's
   start, minus the trailing quiet.
3. DTW. DTW on cepstral features (MFCC 1-13 + deltas, mean/variance normalized per
   signal, so pitch and voice mostly drop out) maps the reference frames onto the
   sung phrase; word boundaries are carried across that path.
4. Onset choice. Sung words start with an onset: a small dynamic program gives each
   word one vocal onset, in order, trading closeness to the DTW estimate against
   onset strength (a word may keep its DTW time if no onset fits). A word ends where
   the voice drops 18 dB below its peak, or at the next word's start.
5. Cross-check. A start where DTW and the onset snap disagree by > 90 ms is flagged.

Knobs (environment): REFVOICE (eSpeak voice of the reference, default en-us+f2: a
voice in the singer's register, not the singer's own), FEATS (mfcc+d | mfcc | mel),
METRIC (cosine | euclidean). The sweep that chose the defaults is in the README.

If song/truth.json exists (it does for our synthesized song) the result is scored
against it and the report is written to analysis/align_report.json.
"""
import json
import os
import subprocess
import tempfile

import librosa
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SR = 22050
HOP = 220  # 10 ms
SNAP = 0.09


def load_vocals():
    x, sr = sf.read(os.path.join(ROOT, "song", "stems", "vocals.wav"))
    return librosa.resample(x.mean(1), orig_sr=sr, target_sr=SR)


def espeak(text):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "r.wav")
        subprocess.run(["espeak-ng", "-v", os.environ.get("REFVOICE", "en-us+f2"), "-s", "150", "-w", p, text], check=True)
        x, sr = sf.read(p)
    return librosa.resample(x, orig_sr=sr, target_sr=SR) if sr != SR else x


def trim(x, rel=0.02):
    nz = np.flatnonzero(np.abs(x) > rel * np.abs(x).max())
    return (nz[0], nz[-1] + 1) if len(nz) else (0, len(x))


def reference(words):
    """Speech for the line, one word at a time with short gaps, and each word's end (s)."""
    gap = np.zeros(int(0.04 * SR))
    parts, ends, t = [], [], 0.0
    for w in words:
        x = espeak(w.replace("’", "'").strip(",."))
        i, j = trim(x)
        parts += [x[i:j], gap]
        t += (j - i) / SR
        ends.append(t)
        t += len(gap) / SR
    return np.concatenate(parts[:-1]), np.array(ends)


def feats(x):
    mode = os.environ.get("FEATS", "mfcc+d")
    m = librosa.feature.mfcc(y=x, sr=SR, n_mfcc=14, hop_length=HOP, n_fft=1024)[1:]
    if mode == "mfcc":
        f = m
    elif mode == "mel":
        f = librosa.power_to_db(librosa.feature.melspectrogram(y=x, sr=SR, hop_length=HOP, n_fft=1024, n_mels=40, fmax=8000))
    else:
        f = np.vstack([m, librosa.feature.delta(m)])
    f = (f - f.mean(1, keepdims=True)) / (f.std(1, keepdims=True) + 1e-6)
    return f


def pick_onsets(est, onsets, strength, w0, w1, reach=0.6, sigma=0.12, skip=2.5):
    """One onset per word, in order, close to the DTW estimate and strong (dynamic programming).

    Cost of giving word i the onset c: ((c - est_i) / sigma)^2 / 2 - strength(c); a word
    may also take no onset (cost `skip`). Consecutive starts are >= 80 ms apart.
    Returns the chosen start per word (None where no onset was taken).
    """
    sel = (onsets >= w0 - 0.05) & (onsets <= w1)
    on, st = onsets[sel], np.minimum(strength[sel], 2.0)
    n, m = len(est), len(on)
    INF = 1e9
    # state j = index of onset used by the last word that took one (m = none yet)
    cost = np.full((n + 1, m + 1), INF)
    back = np.zeros((n + 1, m + 1, 2), int)
    cost[0, m] = 0.0
    for i in range(n):
        for j in range(m + 1):
            c0 = cost[i, j]
            if c0 >= INF:
                continue
            last = on[j] if j < m else -1.0
            # no onset for word i
            if c0 + skip < cost[i + 1, j]:
                cost[i + 1, j] = c0 + skip
                back[i + 1, j] = (j, -1)
            for k in range(m):
                if on[k] < last + 0.08 or abs(on[k] - est[i]) > reach:
                    continue
                c = c0 + 0.5 * ((on[k] - est[i]) / sigma) ** 2 - st[k]
                if c < cost[i + 1, k]:
                    cost[i + 1, k] = c
                    back[i + 1, k] = (j, k)
    j = int(np.argmin(cost[n]))
    out = [None] * n
    for i in range(n, 0, -1):
        pj, k = back[i, j]
        if k >= 0:
            out[i - 1] = float(on[k])
        j = pj
    return out


def main():
    src = json.load(open(os.path.join(ROOT, "data", "lyrics.src.json")))["lines"]
    voc = load_vocals()
    rms = librosa.feature.rms(y=voc, hop_length=HOP, frame_length=1024)[0]
    rms_db = librosa.amplitude_to_db(rms, ref=np.max)
    ft = lambda i: i * HOP / SR  # noqa: E731
    oenv = librosa.onset.onset_strength(y=voc, sr=SR, hop_length=HOP)
    of = librosa.onset.onset_detect(onset_envelope=oenv, sr=SR, hop_length=HOP, backtrack=False, delta=0.04)
    bt = librosa.onset.onset_backtrack(of, oenv)
    onsets = ft(bt)
    ostr = oenv[of] / np.percentile(oenv[of], 90)

    def jump(t):
        i = int(t * SR / HOP)
        return rms_db[i:i + 15].max() - rms_db[max(0, i - 30):i].mean()

    # Line starts: the vocal onset near each rough time with the biggest jump in level
    # (a line starts after the previous one has died away).
    starts_all, prev = [], -1.0
    for line in src:
        cand = onsets[(np.abs(onsets - line["t"]) <= 1.2) & (onsets > prev + 0.5)]
        prev = float(cand[np.argmax([jump(c) for c in cand])]) if len(cand) else line["t"]
        starts_all.append(prev)

    out, flags = [], []
    for li, line in enumerate(src):
        words = line["text"].split()
        ref, ref_ends = reference(words)
        p0 = starts_all[li]
        # Phrase end: the next line's start, minus the silence (and reverb) before it.
        lim = starts_all[li + 1] - 0.05 if li + 1 < len(src) else len(voc) / SR
        a, b = int(p0 * SR / HOP), int(lim * SR / HOP)
        loud = np.flatnonzero(rms_db[a:b] > rms_db[a:b].max() - 14)
        p1 = p0 + ft(loud[-1]) + 0.1
        w0, w1 = p0, p1
        seg = voc[int(w0 * SR):int(w1 * SR)]
        Fr, Fs = feats(ref), feats(seg)
        D, wp = librosa.sequence.dtw(X=Fr, Y=Fs, metric=os.environ.get("METRIC", "cosine"))
        wp = wp[::-1]
        ref_frames = np.arange(Fr.shape[1])
        # first sung frame for each reference frame
        m = np.full(len(ref_frames), np.nan)
        for r, s_ in wp:
            if np.isnan(m[r]):
                m[r] = s_
        m = np.maximum.accumulate(np.nan_to_num(m, nan=0))
        r_starts = np.concatenate([[0.0], ref_ends[:-1]])
        dtw_starts = [w0 + ft(m[min(int(round(rs * SR / HOP)), len(m) - 1)]) for rs in r_starts]
        line_end_dtw = w1

        starts = pick_onsets(dtw_starts, onsets, ostr, w0, w1)
        res = []
        for i, w in enumerate(words):
            if starts[i] is None:
                flags.append({"line": li, "word": w, "dtw": round(dtw_starts[i], 3), "reason": "no vocal onset agrees with DTW"})
            elif abs(starts[i] - dtw_starts[i]) > SNAP:
                flags.append({"line": li, "word": w, "dtw": round(dtw_starts[i], 3), "onset": round(starts[i], 3),
                              "reason": "DTW and onset disagree by more than 90 ms"})
            res.append({"w": w, "start": starts[i] if starts[i] is not None else dtw_starts[i]})
        for i in range(1, len(res)):  # keep order
            res[i]["start"] = max(res[i]["start"], res[i - 1]["start"] + 0.05)
        for i, r in enumerate(res):
            lim = res[i + 1]["start"] if i + 1 < len(res) else line_end_dtw
            a, b = int(r["start"] * SR / HOP), int(lim * SR / HOP)
            peak = rms_db[a:b].max() if b > a else -80
            quiet = np.flatnonzero(rms_db[a:b] < peak - 18)
            # first quiet frame after the loudest part of the word
            pk = a + int(np.argmax(rms_db[a:b])) if b > a else a
            quiet = quiet[quiet + a > pk]
            r["end"] = ft(a + quiet[0]) if len(quiet) else lim
            r["end"] = max(r["end"], r["start"] + 0.08)
        out.append({
            "text": line["text"],
            "start": round(res[0]["start"], 3),
            "end": round(res[-1]["end"], 3),
            "words": [{"w": r["w"], "start": round(r["start"], 3), "end": round(r["end"], 3)} for r in res],
        })
        print(f"{out[-1]['start']:7.2f}  {line['text']}")

    with open(os.path.join(ROOT, "data", "lyrics.json"), "w") as f:
        json.dump({"lines": out}, f, indent=1, ensure_ascii=False)

    truth_p = os.path.join(ROOT, "song", "truth.json")
    if os.path.exists(truth_p):
        truth = json.load(open(truth_p))["lines"]
        es, ee = [], []
        for a, b in zip(out, truth):
            for wa, wb in zip(a["words"], b["words"]):
                es.append(wa["start"] - wb["start"])
                ee.append(wa["end"] - wb["end"])
        es, ee = np.abs(es), np.abs(ee)
        rep = {
            "words": len(es),
            "start_err_ms": {"median": round(float(np.median(es)) * 1000, 1), "p95": round(float(np.percentile(es, 95)) * 1000, 1),
                             "max": round(float(es.max()) * 1000, 1), "within_50ms": int((es <= 0.05).sum())},
            "end_err_ms": {"median": round(float(np.median(ee)) * 1000, 1), "p95": round(float(np.percentile(ee, 95)) * 1000, 1)},
            "flags": flags,
        }
        with open(os.path.join(HERE, "align_report.json"), "w") as f:
            json.dump(rep, f, indent=1, ensure_ascii=False)
        print(json.dumps({k: v for k, v in rep.items() if k != "flags"}), f"flags={len(flags)}")


if __name__ == "__main__":
    main()
