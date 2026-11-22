"""Manim's shapes fitted to real LaTeX glyphs, for the shape objects (scene/shapes.ts: where each
library fits a `SurroundingRectangle`, a circle around, an `Underline` and a `Cross` to some
glyphs; geom/shapes.ts builds them). Over slices of `MathTex("x^2+bx+c")` (CE) / `Tex` (GL) — the
whole formula, the glyphs 2–4 (`+bx`), the lone `x` — as is or scaled 1.3 and rotated 20°, each
shape as the export writes it: the points of every member as the library stores them (CE: four per
cubic; GL: shared-anchor quadratics), its style (fill and stroke RGBA, stroke width), what Manim
reads from the shape (`get_center`, `width`, `height`), and the target's glyph points, so that the
test can measure the target itself.

The circle is the export's `_circle_around` helper: `Circle(radius=hypot(width, height) / 2 +
buff).move_to(target)`, the circle through the corners of the target's box, `buff` further out
(each library's own `Circle.surround` means something else: a `buffer_factor` in CE, a circle as
wide as the target plus a `buff` in GL). The GL underline and cross take a plain stroke width, as
the export passes it (their defaults are tapered), and the GL underline no stretch.

Usage: run from a scratch directory (needs LaTeX):
    manim_ce/venv/bin/python <this dir>/gen_decorations.py ce  -> manim-decorations-ce.json
    manim_gl/venv/bin/python <this dir>/gen_decorations.py gl  -> manim-decorations-gl.json
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

    def members(m):
        return list(m.family_members_with_points())

    def style(m):
        return {
            "fill": [float(v) for v in m.get_fill_rgbas()[0]],
            "stroke": [float(v) for v in m.get_stroke_rgbas()[0]],
            "width": float(m.get_stroke_width()),
        }

    def size(m):
        return float(m.width), float(m.height)

    def box(target, buff, radius):
        return SurroundingRectangle(target, buff=buff, corner_radius=radius)

    def underline(target, buff):
        return Underline(target, buff=buff)

    def cross(target):
        return Cross(target)
else:
    from manimlib import *  # noqa

    def formula(s):
        return Tex(s)

    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()

    def members(m):
        return [sm for sm in m.get_family() if sm.has_points()]

    def style(m):
        return {
            "fill": [float(v) for v in m.uniforms["fill_rgba"]],
            "stroke": [float(v) for v in m.data.rows_or_defaults["stroke_rgba"][0]],
            "width": float(m.get_stroke_width()),
        }

    def size(m):
        return float(m.get_width()), float(m.get_height())

    def box(target, buff, radius):
        rect = SurroundingRectangle(target, buff=buff)
        if radius > 0:
            rect.round_corners(radius)
        return rect

    def underline(target, buff):
        return Underline(target, buff=buff, stroke_width=4, stretch_factor=1)

    def cross(target):
        return Cross(target, stroke_width=6)


def circle_around(target, buff):
    radius = np.hypot(target.get_width(), target.get_height()) / 2 + buff
    return Circle(radius=radius).move_to(target)


A = "x^2+bx+c"
SLICES = [("whole", None), ("part", (2, 5)), ("one", (0, 1))]
TRANSFORMS = [
    ("as-is", lambda m: m),
    ("scaled-rotated", lambda m: m.scale(1.3).rotate(20 * DEGREES)),
]
# shape, buff, corner radius
SHAPES = [
    ("box", 0.1, 0), ("box", 0.3, 0.2),
    ("circle", 0.1, 0), ("circle", 0.3, 0),
    ("underline", 0.1, 0), ("underline", 0.25, 0),
    ("cross", 0, 0),
]


def v2(p):
    return [float(p[0]), float(p[1])]


def member(m):
    return {"cls": type(m).__name__, "points": pts(m), **style(m)}


cases = []
transforms = []
for tname, transform in TRANSFORMS:
    transforms.append({"name": tname, "glyphs": [pts(g) for g in transform(formula(A))]})
    for sname, sl in SLICES:
        for shape, buff, radius in SHAPES:
            a = transform(formula(A))
            target = a if sl is None else a[sl[0]:sl[1]]
            if shape == "box":
                m = box(target, buff, radius)
            elif shape == "circle":
                m = circle_around(target, buff)
            elif shape == "underline":
                m = underline(target, buff)
            else:
                m = cross(target)
            w, h = size(m)
            cases.append({
                "transform": tname, "slice": sname, "shape": shape, "buff": buff, "radius": radius,
                "targetGlyphs": list(range(len(a))) if sl is None else list(range(sl[0], sl[1])),
                "members": [member(sm) for sm in members(m)],
                "center": v2(m.get_center()),
                "width": w,
                "height": h,
            })

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32: 7 decimals is its noise


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


out = rnd({"lib": lib, "formula": A, "transforms": transforms, "cases": cases})
json.dump(out, open(f"manim-decorations-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "members", [len(c["members"]) for c in cases[:7]])
