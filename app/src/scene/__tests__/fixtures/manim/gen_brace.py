"""Manim's braces on real LaTeX glyphs, for geom/brace.ts (the exact brace of each library in the
browser). `Brace(target, direction, buff[, sharpness])` over slices of `MathTex("x^2+bx+c")` (CE) /
`Tex` (GL) — the whole formula, the glyphs 2–4 (`+bx`), the lone `x` — as is or scaled 1.3 and
rotated 20°, on the four sides and at an angle, with the points of every piece of the brace as the
library stores them (CE: one path, four points per cubic; GL: six pieces, shared-anchor
quadratics), what Manim reads from it (`get_center`, `get_corner(UL)`, `get_tip`, `get_direction`,
`width`, `height`) and the target's glyph points, so that the test can measure the target itself.
Also the six pieces of the natural GL brace (`Tex(r"\\underbrace{\\qquad}")` at font size 48, every
decimal kept: they are the constant of geom/brace.ts) with the calibration height ManimGL scaled
them by, and the CE brace of a 1-unit line.

Usage: run from a scratch directory (needs LaTeX):
    manim_ce/venv/bin/python <this dir>/gen_brace.py ce  -> manim-brace-ce.json
    manim_gl/venv/bin/python <this dir>/gen_brace.py gl  -> manim-brace-gl.json
"""
import json, math, sys
import numpy as np

lib = sys.argv[1]
if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    def formula(s):
        return MathTex(s)[0]
    def pts(m):
        return np.array(m.points)[:, :2].tolist()
    def size(m):
        return float(m.width), float(m.height)
    def pieces(brace):
        return [pts(brace)]
    def make(target, direction, buff, sharpness):
        return Brace(target, direction, buff=buff, sharpness=sharpness)
else:
    from manimlib import *  # noqa
    from manimlib.utils.tex_file_writing import latex_to_svg
    from manimlib.mobject.svg.svg_mobject import get_svg_content_height
    def formula(s):
        return Tex(s)
    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()
    def size(m):
        return float(m.get_width()), float(m.get_height())
    def pieces(brace):
        return [pts(p) for p in brace]
    def make(target, direction, buff, sharpness):
        return Brace(target, direction, buff=buff)

A = "x^2+bx+c"
SLICES = [("whole", None), ("part", (2, 5)), ("one", (0, 1))]
TRANSFORMS = [
    ("as-is", lambda m: m),
    ("scaled-rotated", lambda m: m.scale(1.3).rotate(20 * DEGREES)),
]
DIRECTIONS = [("down", 0), ("up", 180), ("left", 270), ("right", 90), ("angle", 30), ("angle2", -135)]
BUFFS = [0.2, 0.35]
SHARPNESSES = [2, 1.2] if lib == "ce" else [2]

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

cases = []
transforms = []
for tname, transform in TRANSFORMS:
    transforms.append({"name": tname, "glyphs": [pts(g) for g in transform(formula(A))]})
    runs = [(sname, dname, 0.2, 2) for sname, _ in SLICES for dname, _ in DIRECTIONS]
    runs += [("part", "down", 0.35, 2)]
    if lib == "ce":
        runs += [(sname, "down", 0.2, sharp) for sname in ("whole", "part") for sharp in (1.2, 0.5)]
    for sname, dname, buff, sharpness in runs:
        sl = dict(SLICES)[sname]
        degrees = dict(DIRECTIONS)[dname]
        a = transform(formula(A))
        target = a if sl is None else a[sl[0]:sl[1]]
        b = make(target, direction_vector(degrees), buff, sharpness)
        cases.append({
            "transform": tname, "slice": sname, "direction": dname, "degrees": degrees,
            "buff": buff, "sharpness": sharpness,
            "targetGlyphs": list(range(len(a))) if sl is None else list(range(sl[0], sl[1])),
            "pieces": pieces(b),
            "center": v2(b.get_center()),
            "ul": v2(b.get_corner(UL)),
            "tip": v2(b.get_tip()),
            "dir": v2(b.get_direction()),
            "width": size(b)[0],
            "height": size(b)[1],
        })

out = {"lib": lib, "formula": A, "transforms": transforms, "cases": cases}
def precise(x):  # the natural pieces are copied into geom/brace.ts: keep every decimal
    if isinstance(x, float):
        return round(x, 12)
    if isinstance(x, list):
        return [precise(v) for v in x]
    if isinstance(x, dict):
        return {k: precise(v) for k, v in x.items()}
    return x

if lib == "gl":
    # The six pieces of the natural brace, as ManimGL holds them at font size 48: the constant of
    # geom/brace.ts (GL_BRACE_PIECES), with the calibration height its scale came from.
    natural = Tex(r"\underbrace{\qquad}")
    out["natural"] = precise({
        "h0": get_svg_content_height(latex_to_svg("0", show_message_during_execution=False)),
        "pieces": [pts(p) for p in natural],
        "width": size(natural)[0],
        "height": size(natural)[1],
    })
else:
    # The template path as the brace of a 1-unit line, buff 0: its corner at the origin.
    b = Brace(Line(ORIGIN, RIGHT), DOWN, buff=0, sharpness=2)
    out["natural"] = precise({"pieces": [pts(b)], "width": size(b)[0], "height": size(b)[1]})

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32: 7 decimals is its noise

def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x

natural = out.pop("natural")
out = rnd(out)
out["natural"] = natural
json.dump(out, open(f"manim-brace-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "pieces", len(cases[0]["pieces"]), "points", [len(p) for p in cases[0]["pieces"]])
