"""Manim's bounding boxes on real LaTeX glyphs, for scene/measure.ts (the box rule of each library:
ManimCE reads corners and centres from the anchors of the curves and widths from every point,
ManimGL every point for both). `MathTex("x^2+bx+c")` (CE) / `Tex` (GL) under a few transforms —
as is, scaled, rotated, scaled + rotated + flipped — with the points of every glyph as the library
stores them after the transform (CE: four points per cubic; GL: shared-anchor quadratics), and
what Manim reads from the whole formula and from its glyphs 2–4 (`+bx`): `get_center`,
`get_corner(DL)`, `get_corner(UR)`, `width`, `height`; plus where `next_to` puts a second formula
(`"ab"`, recorded at the origin) beside those glyphs on each side, as the shift of its centre.

Usage: run from a scratch directory (needs LaTeX):
    manim_ce/venv/bin/python <this dir>/gen_boxes.py ce  -> manim-boxes-ce.json
    manim_gl/venv/bin/python <this dir>/gen_boxes.py gl  -> manim-boxes-gl.json
"""
import json, sys
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
else:
    from manimlib import *  # noqa
    def formula(s):
        return Tex(s)
    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()
    def size(m):
        return float(m.get_width()), float(m.get_height())

A = "x^2+bx+c"
B = "ab"
SLICE = (2, 5)
TRANSFORMS = [
    ("as-is", lambda m: m),
    ("scaled", lambda m: m.scale(1.3)),
    ("rotated", lambda m: m.rotate(25 * DEGREES)),
    ("scaled-rotated-flipped", lambda m: m.scale(0.8).rotate(-40 * DEGREES).stretch(-1, 0)),
]
SIDES = [("down", DOWN), ("up", UP), ("left", LEFT), ("right", RIGHT)]

def v2(p):
    return [float(p[0]), float(p[1])]

def reading(m):
    return {
        "center": v2(m.get_center()),
        "dl": v2(m.get_corner(DL)),
        "ur": v2(m.get_corner(UR)),
        "width": size(m)[0],
        "height": size(m)[1],
    }

out = {"lib": lib, "formula": A, "label": B, "slice": list(SLICE), "transforms": []}
b0 = formula(B)
out["labelPoints"] = [pts(g) for g in b0]
for name, transform in TRANSFORMS:
    a = transform(formula(A))
    part = a[SLICE[0]:SLICE[1]]
    entry = {
        "name": name,
        "glyphs": [pts(g) for g in a],
        "whole": reading(a),
        "part": reading(part),
        "nextTo": [],
    }
    for side, direction in SIDES:
        for target_name, target, buff in (("part", part, 0.25), ("whole", a, 0.1)):
            b = formula(B)
            before = v2(b.get_center())
            b.next_to(target, direction, buff=buff)
            after = v2(b.get_center())
            entry["nextTo"].append({
                "side": side, "target": target_name, "buff": buff,
                "shift": [after[0] - before[0], after[1] - before[1]],
            })
    out["transforms"].append(entry)

def rnd(x):  # 6 decimals; the tests compare to 1e-5
    if isinstance(x, float):
        return round(x, 6)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x

json.dump(rnd(out), open(f"manim-boxes-{lib}.json", "w"), separators=(",", ":"))
print(lib, "glyphs", len(out["transforms"][0]["glyphs"]), "label glyphs", len(out["labelPoints"]))
