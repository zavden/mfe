"""Manim's lines and arrows between points and real LaTeX glyphs, for the line objects
(scene/lines.ts: where each library puts an end that is on glyphs; geom/lines.ts builds the line,
its dashes and its tips). Two formulas apart, `MathTex("x^2+bx+c")` (CE) / `Tex` (GL) on the left
and `y=mx` on the right — the first as is, or scaled 1.3 and rotated 20° —, and between a point or
some glyphs of the one and a point or some glyphs of the other, each kind as the export writes it:

  - `Line(start, end, buff=)` and `DashedLine(start, end, buff=, dash_length=)` in both libraries;
  - an arrow and a double arrow: ManimCE's `Arrow` and `DoubleArrow`; in ManimGL, whose own
    `Arrow` is another object, `Line(start, end, buff=, stroke_width=).add_tip(length=, width=)`
    and, for two tips, the export's `_double_arrow` helper (`double_arrow` below) — with ManimCE's
    values: the tip capped at a quarter of the line's length after its buff, the stroke width at
    five times that length (an arrow) or five times what is left of it between the two tips (a
    double arrow).

An end on glyphs is passed as the mobject (the whole formula, a slice of it, one glyph), so that
the library finds the point: ManimCE the point of the boundary farthest towards the other end
(`get_boundary_point`), ManimGL where that direction leaves the bounding box
(`get_continuous_bounding_box_point`), both from the centres of the two ends.

For every case: the points of every member as the library stores them (CE: four per cubic; GL:
shared-anchor quadratics), its style (fill and stroke RGBA, stroke width), `get_start()`,
`get_end()` and `get_center()` of the line, and the glyph points of both formulas, so that the
test can measure the ends itself.

Usage: run from a scratch directory (needs LaTeX):
    manim_ce/venv/bin/python <this dir>/gen_lines.py ce  -> manim-lines-ce.json
    manim_gl/venv/bin/python <this dir>/gen_lines.py gl  -> manim-lines-gl.json
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

    def length_of(m):
        return float(m.get_length())
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
            "fill": [float(v) for v in m.uniforms["fill_rgba"]] if "fill_rgba" in m.uniforms
            else [float(v) for v in m.data.rows_or_defaults["fill_rgba"][0]],
            "stroke": [float(v) for v in m.data.rows_or_defaults["stroke_rgba"][0]],
            "width": float(m.get_stroke_width()),
        }

    def length_of(m):
        return float(m.get_length())


LINE_STROKE = 4
ARROW_STROKE = 6
ARROW_TIP = 0.35


def p3(p):
    return np.array([p[0], p[1], 0.0])


def double_arrow(start, end, buff, stroke_width, tip):
    """The export's `_double_arrow` helper for ManimGL: a line with a tip at each end. A second
    `add_tip` would move the first one (it resets the ends of the line with its tip on), so both
    tips are made on the line as it is, and the line then runs between their bases."""
    line = Line(start, end, buff=buff, stroke_width=stroke_width)
    front = line.create_tip(length=tip, width=tip)
    back = line.create_tip(at_start=True, length=tip, width=tip)
    line.set_points_as_corners([back.get_base(), front.get_base()])
    for mob in (front, back):
        mob.set_color(line.get_stroke_color())
        line.add(mob)
    line.tip = front
    line.start_tip = back
    return line


def build(kind, start, end, buff, options):
    """The mobject of `kind` between `start` and `end` (points or mobjects), as the export writes
    it, and what the editor passes for an arrow of ManimGL: the capped tip and stroke width."""
    stroke = options.get("stroke_width", ARROW_STROKE if "arrow" in kind else LINE_STROKE)
    tip_length = options.get("tip_length", ARROW_TIP)
    values = {}
    if kind == "line":
        m = Line(start, end, buff=buff, stroke_width=stroke)
    elif kind == "dashed":
        m = DashedLine(start, end, buff=buff, stroke_width=stroke,
                       dash_length=options.get("dash_length", 0.05))
    elif lib == "ce":
        cls = Arrow if kind == "arrow" else DoubleArrow
        m = cls(start, end, buff=buff, stroke_width=stroke, tip_length=tip_length)
    else:
        # ManimCE's rules, from the line the library builds: its length after the buff caps the
        # tip (a quarter of it) and the stroke width — five times it, or five times what the two
        # tips of a double arrow leave of it, which is where ManimCE measures that one.
        length = length_of(Line(start, end, buff=buff))
        tip = min(tip_length, 0.25 * length)
        shaft = length - 2 * tip if kind == "double_arrow" else length
        width = min(stroke, 5 * shaft)
        values = {"tip": tip, "shaftWidth": width}
        # A line the buff left without length has no tip to build (`add_tip` fails on it): the
        # export writes the line alone.
        if tip <= 0:
            m = Line(start, end, buff=buff, stroke_width=width)
        elif kind == "arrow":
            m = Line(start, end, buff=buff, stroke_width=width)
            m.add_tip(length=tip, width=tip)
        else:
            m = double_arrow(start, end, buff, width, tip)
    return m, {"strokeWidth": stroke, "tipLength": tip_length, **values}


A = "x^2+bx+c"
B = "y=mx"
A_AT = [-3.0, 1.0]
B_AT = [2.5, -1.2]
TRANSFORMS = [
    ("as-is", lambda m: m),
    ("scaled-rotated", lambda m: m.scale(1.3).rotate(20 * DEGREES)),
]
KINDS = ["line", "dashed", "arrow", "double_arrow"]
# What each end is: a point, or glyphs of a formula ("a" on the left, "b" on the right; a slice,
# or None for the whole of it).
POINT_1 = [-1.5, -2.0]
POINT_2 = [1.0, 2.25]
ENDS = [
    ("point-point", ("point", POINT_1), ("point", POINT_2)),
    ("glyphs-point", ("a", (2, 5)), ("point", POINT_2)),
    ("point-glyphs", ("point", POINT_1), ("b", None)),
    ("whole-whole", ("a", None), ("b", None)),
    ("part-part", ("a", (0, 2)), ("b", (2, 4))),
    ("one-one", ("b", (0, 1)), ("a", (6, 7))),
    ("same-formula", ("a", (0, 1)), ("a", (6, 7))),
]
BUFFS = [0.0, 0.25]


def v2(p):
    return [float(p[0]), float(p[1])]


def member(m):
    return {"cls": type(m).__name__, "points": pts(m), **style(m)}


def end_of(spec, a, b):
    where, what = spec
    if where == "point":
        return p3(what)
    mob = a if where == "a" else b
    return mob if what is None else mob[what[0]:what[1]]


def end_json(spec, a, b):
    where, what = spec
    if where == "point":
        return {"point": what}
    mob = a if where == "a" else b
    glyphs = list(range(len(mob))) if what is None else list(range(what[0], what[1]))
    return {"formula": where, "glyphs": glyphs}


def placed(transform):
    a = transform(formula(A)).move_to(p3(A_AT))
    b = formula(B).move_to(p3(B_AT))
    return a, b


def read(point_of):
    """What the library reads of the line, or None where it has nothing to read it from (ManimGL's
    dashed line of no length has no dash)."""
    try:
        return v2(point_of())
    except Exception:
        return None


def case(kind, start, end, buff, options, extra):
    m, values = build(kind, start, end, buff, options)
    return {
        "kind": kind, "buff": buff, **values, **extra,
        "members": [member(sm) for sm in members(m)],
        "start": read(m.get_start),
        "end": read(m.get_end),
        "center": read(m.get_center),
    }


cases = []
transforms = []
for tname, transform in TRANSFORMS:
    a, b = placed(transform)
    transforms.append({"name": tname, "a": [pts(g) for g in a], "b": [pts(g) for g in b]})
    for ename, start, end in ENDS:
        for kind in KINDS:
            for buff in BUFFS:
                a, b = placed(transform)
                cases.append(case(kind, end_of(start, a, b), end_of(end, a, b), buff, {}, {
                    "transform": tname, "ends": ename,
                    "from": end_json(start, a, b), "to": end_json(end, a, b),
                }))

# Short and odd lines between two points: the caps of an arrow's tip and stroke, a buff longer
# than half the line (ManimCE leaves the line whole, ManimGL shrinks it to its midpoint), dashes
# of another length, and the two ends on one point.
SHORT = [
    ([0.0, 0.0], [0.8, 0.0], 0.0, {}),
    ([0.0, 0.0], [0.3, 0.4], 0.0, {}),
    ([1.0, 1.0], [1.04, 1.03], 0.0, {}),
    ([0.0, 0.0], [0.8, 0.6], 0.25, {}),
    ([0.0, 0.0], [0.3, 0.0], 0.25, {}),
    ([-2.0, 0.5], [2.0, -0.5], 0.1, {"stroke_width": 8, "tip_length": 0.5, "dash_length": 0.2}),
    ([-1.0, 0.0], [1.0, 0.0], 0.0, {"stroke_width": 2, "tip_length": 0.2, "dash_length": 0.31}),
    ([0.0, 0.0], [0.06, 0.0], 0.0, {"dash_length": 0.05}),
]
for start, end, buff, options in SHORT:
    for kind in KINDS:
        cases.append(case(kind, p3(start), p3(end), buff, options, {
            "transform": "as-is", "ends": "short",
            "from": {"point": start}, "to": {"point": end},
            "options": {
                "strokeWidth": options.get("stroke_width"),
                "tipLength": options.get("tip_length"),
                "dashLength": options.get("dash_length"),
            },
        }))

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32: 7 decimals is its noise


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


out = rnd({"lib": lib, "formulas": {"a": A, "b": B}, "transforms": transforms, "cases": cases})
json.dump(out, open(f"manim-lines-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "members", sorted({len(c["members"]) for c in cases}))
