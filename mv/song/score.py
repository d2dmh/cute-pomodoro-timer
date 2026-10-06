"""The score of "Little Tomato", an original song written for this project.

Everything the composer and the video need to know about the song lives here:
tempo, form, chords and the sung melody. The melody is one entry per word:
(word, start beat within the line, length in beats, MIDI pitches). A word with
several pitches is sung as a small melisma, the pitches spread evenly over it.

The renderer never reads this file: it gets its timing from what the analysis
recovers from the audio (data/lyrics.json, data/audio.json), as it would for a
song it did not compose. The composer writes the true timings to
song/truth.json only so the aligner can be scored against them.
"""

BPM = 120.0
BEAT = 60.0 / BPM          # 0.5 s
BAR = 4 * BEAT             # 2.0 s
BARS = 34                  # 68 s of music, then a ringing tail

# (name, first bar, bars)
SECTIONS = [
    ("intro", 0, 4),
    ("verse", 4, 8),
    ("chorus", 12, 8),
    ("bridge", 20, 4),
    ("chorus2", 24, 8),
    ("outro", 32, 2),
]

# One chord per bar (root MIDI note, quality).
_V = [("C", "maj"), ("A", "min"), ("F", "maj"), ("G", "maj")]
_CH = [("F", "maj"), ("G", "maj"), ("E", "min"), ("A", "min"),
       ("F", "maj"), ("G", "maj"), ("C", "maj"), ("C", "maj")]
_BR = [("A", "min"), ("F", "maj"), ("C", "maj"), ("G", "maj")]
CHORDS = ([("C", "maj")] * 2 + [("A", "min"), ("G", "maj")]   # intro
          + _V * 2 + _CH + _BR + _CH + [("C", "maj")] * 2)
assert len(CHORDS) == BARS

NOTE = {"C": 48, "D": 50, "E": 52, "F": 53, "G": 55, "A": 57, "B": 59}


def chord_notes(bar):
    root, q = CHORDS[bar]
    r = NOTE[root]
    third = 3 if q == "min" else 4
    return r, [r, r + third, r + 7]


# Lines: (first bar, text, [(word, beat, beats, [pitches]), ...])
VERSE = [
    (4, "Twenty-five minutes on the clock", [
        ("Twenty-five", 0.0, 1.5, [67, 65, 64]), ("minutes", 1.5, 1.0, [67, 69]),
        ("on", 2.5, 0.5, [67]), ("the", 3.0, 0.5, [64]), ("clock", 3.5, 2.5, [60])]),
    (6, "Phone face down, let the noises stop", [
        ("Phone", 0.0, 0.5, [69]), ("face", 0.5, 0.5, [69]), ("down,", 1.0, 1.0, [67]),
        ("let", 2.0, 0.5, [65]), ("the", 2.5, 0.5, [64]), ("noises", 3.0, 1.0, [62, 64]),
        ("stop", 4.0, 2.0, [67])]),
    (8, "One small tomato on my desk", [
        ("One", 0.0, 0.5, [67]), ("small", 0.5, 0.5, [67]), ("tomato", 1.0, 1.5, [69, 67, 64]),
        ("on", 2.5, 0.5, [64]), ("my", 3.0, 0.5, [62]), ("desk", 3.5, 2.5, [60])]),
    (10, "Do the next thing, forget the rest", [
        ("Do", 0.0, 0.5, [65]), ("the", 0.5, 0.5, [65]), ("next", 1.0, 0.5, [69]),
        ("thing,", 1.5, 1.0, [67]), ("forget", 2.5, 1.0, [65, 64]), ("the", 3.5, 0.5, [62]),
        ("rest", 4.0, 2.5, [62])]),
]

CHORUS = [
    (0, "Tick tock, little tomato", [
        ("Tick", 0.0, 0.5, [72]), ("tock,", 0.5, 1.0, [67]), ("little", 1.5, 1.0, [69, 69]),
        ("tomato", 2.5, 2.5, [72, 71, 67])]),
    (2, "Count me down and let me go", [
        ("Count", 0.0, 0.5, [71]), ("me", 0.5, 0.5, [71]), ("down", 1.0, 1.0, [67]),
        ("and", 2.0, 0.5, [64]), ("let", 2.5, 0.5, [64]), ("me", 3.0, 0.5, [67]),
        ("go", 3.5, 2.5, [69])]),
    (4, "Work, then rest, then work some more", [
        ("Work,", 0.0, 1.0, [72]), ("then", 1.0, 0.5, [69]), ("rest,", 1.5, 1.0, [72]),
        ("then", 2.5, 0.5, [69]), ("work", 3.0, 0.5, [74]), ("some", 3.5, 0.5, [72]),
        ("more", 4.0, 2.0, [71])]),
    (6, "That’s what the timer’s for", [
        ("That’s", 0.0, 0.5, [67]), ("what", 0.5, 0.5, [69]), ("the", 1.0, 0.5, [71]),
        ("timer’s", 1.5, 1.0, [72, 71]), ("for", 2.5, 3.0, [72])]),
]

BRIDGE = [
    (20, "Ring ring, take a break", [
        ("Ring", 0.0, 1.0, [76]), ("ring,", 1.0, 1.0, [76]), ("take", 2.0, 0.5, [72]),
        ("a", 2.5, 0.5, [71]), ("break", 3.0, 3.0, [69])]),
    (22, "Stretch your arms, there’s tea to make", [
        ("Stretch", 0.0, 1.0, [72, 74]), ("your", 1.0, 0.5, [72]), ("arms,", 1.5, 1.0, [67]),
        ("there’s", 2.5, 0.5, [67]), ("tea", 3.0, 0.5, [69]), ("to", 3.5, 0.5, [71]),
        ("make", 4.0, 2.0, [67])]),
]


def lines():
    out = list(VERSE)
    for base in (12, 24):
        out += [(base + b, text, words) for b, text, words in CHORUS]
    out += BRIDGE
    return sorted(out, key=lambda l: l[0])


def sung_text(word):
    """What the synthetic singer is asked to pronounce for a written word."""
    return word.strip(",.").replace("’", "'")
