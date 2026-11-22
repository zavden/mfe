"""Labels at the tip of Manim's braces, for scene/attach.ts (the `tip` rule of a label). A brace is
built over slices of `MathTex("x^2+bx+c")` (CE) / `Tex` (GL), as is or scaled 1.3 and rotated 20°,
on the four sides and at angles that round to a side (20°) or a corner (45°, 60°, −135°), and at
30° and 62°, where the direction Manim reads from the brace's centre to its tip rounds to a corner
though the angle itself would round to a side (the centre of a tilted brace's box is off its
axis), and a label is put at
its tip: `brace.put_at_tip(label, buff=…)` with a small and a wide label, as is or turned, and
`brace.get_tex("n")` for the gap each library leaves by default. Kept: the brace's tip, its
direction and that direction rounded (`np.round`), the label's glyph points before it is placed,
and the shift `put_at_tip` gave it.

Usage: run from a scratch directory (needs LaTeX):
    manim_ce/venv/bin/python -I <this dir>/gen_brace_labels.py ce  -> manim-brace-labels-ce.json
    manim_gl/venv/bin/python -I <this dir>/gen_brace_labels.py gl  -> manim-brace-labels-gl.json
"""
import json, sys
import numpy as np

lib = sys.argv[1]
if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    def formula(s):
        return MathTex(s)
    def glyphs(m):
        return list(m[0])
    def pts(m):
        return np.array(m.points)[:, :2].tolist()
else:
    from manimlib import *  # noqa
    def formula(s):
        return Tex(s)
    def glyphs(m):
        return list(m)
    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()

A = "x^2+bx+c"
SLICES = [("whole", None), ("part", (2, 5))]
TRANSFORMS = [
    ("as-is", lambda m: m),
    ("scaled-rotated", lambda m: m.scale(1.3).rotate(20 * DEGREES)),
]
DIRECTIONS = [("down", 0), ("up", 180), ("left", 270), ("right", 90), ("angle20", 20),
              ("angle30", 30), ("angle45", 45), ("angle60", 60), ("angle62", 62), ("angle-135", -135)]
LABELS = {"small": "n", "wide": "x^2+1"}
LABEL_TRANSFORMS = [
    ("as-is", lambda m: m),
    ("turned", lambda m: m.scale(0.8).rotate(15 * DEGREES)),
]


def v2(p):
    return [float(p[0]), float(p[1])]


def direction_vector(degrees):
    if degrees == 0:
        return DOWN
    if degrees == 180:
        return UP
    if degrees == 270:
        return LEFT
    if degrees == 90:
        return RIGHT
    return rotate_vector(DOWN, degrees * DEGREES)


def make_label(name, ltransform):
    return dict(LABEL_TRANSFORMS)[ltransform](formula(LABELS[name]))


labels = []
for name in LABELS:
    for lname, _ in LABEL_TRANSFORMS:
        labels.append({"name": name, "transform": lname,
                       "glyphs": [pts(g) for g in glyphs(make_label(name, lname))]})

cases = []
transforms = []
for tname, transform in TRANSFORMS:
    transforms.append({"name": tname, "glyphs": [pts(g) for g in glyphs(transform(formula(A)))]})
    # (slice, direction, label, label transform, label buff: None = brace.get_tex)
    runs = [(s, d, "small", "as-is", 0.3) for s, _ in SLICES for d, _ in DIRECTIONS]
    runs += [("part", d, "wide", "turned", 0.5) for d in ("down", "right", "angle45", "angle60")]
    runs += [("whole", d, "small", "as-is", None) for d in ("down", "up", "left", "right", "angle20")]
    for sname, dname, label, ltransform, lbuff in runs:
        sl = dict(SLICES)[sname]
        degrees = dict(DIRECTIONS)[dname]
        a = transform(formula(A))
        group = glyphs(a)
        target = VGroup(*group) if sl is None else VGroup(*group[sl[0]:sl[1]])
        b = Brace(target, direction_vector(degrees), buff=0.2)
        if lbuff is None:
            before = [pts(g) for g in glyphs(formula(LABELS[label]))]
            placed = b.get_tex(LABELS[label])
        else:
            placed = make_label(label, ltransform)
            before = [pts(g) for g in glyphs(placed)]
            b.put_at_tip(placed, buff=lbuff)
        after = [pts(g) for g in glyphs(placed)]
        shift = [after[0][0][0] - before[0][0][0], after[0][0][1] - before[0][0][1]]
        # A shift moves every point alike.
        worst = max(abs(after[i][j][k] - before[i][j][k] - shift[k])
                    for i in range(len(after)) for j in range(len(after[i])) for k in (0, 1))
        assert worst < 1e-6, worst
        cases.append({
            "transform": tname, "slice": sname, "direction": dname, "degrees": degrees,
            "label": label, "labelTransform": ltransform, "labelBuff": lbuff,
            "targetGlyphs": list(range(len(group))) if sl is None else list(range(sl[0], sl[1])),
            "tip": v2(b.get_tip()),
            "dir": v2(b.get_direction()),
            "rounded": v2(np.round(b.get_direction())),
            "shift": shift,
            "center": v2(placed.get_center()),
        })

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


out = rnd({"lib": lib, "formula": A, "transforms": transforms, "labels": labels, "cases": cases})
json.dump(out, open(f"manim-brace-labels-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "rounded", sorted({tuple(c["rounded"]) for c in cases}))
