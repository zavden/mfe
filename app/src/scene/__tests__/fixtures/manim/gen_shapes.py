"""Manim's basic shapes as each library builds them, for geom/shapes.ts (the exact circle, dot,
rectangle, rounded rectangle, line and arrow of each library in the browser): the points every
member holds (ManimCE: four per cubic; ManimGL: shared-anchor quadratics) and its default style
(fill and stroke RGBA, stroke width).

The arrow is ManimCE's `Arrow` (a stroked line shortened by its buff, a filled triangle tip,
`tip_length` and the stroke width capped by the arrow's length). ManimGL's own `Arrow` is another
object (a filled polygon), so the export writes `Line(...).add_tip(length=, width=)` with the
values ManimCE's rules give (PLAN-RUTA §7 Q7): the ManimGL cases build that, with those values
computed here as the codegen will compute them.

Usage: run from a scratch directory:
    manim_ce/venv/bin/python <this dir>/gen_shapes.py ce  -> manim-shapes-ce.json
    manim_gl/venv/bin/python <this dir>/gen_shapes.py gl  -> manim-shapes-gl.json
"""
import json, sys
import numpy as np

lib = sys.argv[1]
if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"

    def pts(m):
        return np.array(m.points)[:, :2].tolist()

    def style(m):
        return {
            "fill": [float(v) for v in m.get_fill_rgbas()[0]],
            "stroke": [float(v) for v in m.get_stroke_rgbas()[0]],
            "width": float(m.get_stroke_width()),
        }
else:
    from manimlib import *  # noqa

    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()

    def style(m):
        return {
            "fill": [float(v) for v in m.uniforms["fill_rgba"]],
            "stroke": [float(v) for v in m.data.rows_or_defaults["stroke_rgba"][0]],
            "width": float(m.get_stroke_width()),
        }


def p3(xy):
    return np.array([xy[0], xy[1], 0.0])


def member(m):
    return {"cls": type(m).__name__, "points": pts(m), **style(m)}


# ManimCE's Arrow rules (mobject/geometry/line.py): the buff shortens the line unless it is shorter
# than twice the buff; the tip is `tip_length` capped at a quarter of the length that is left, the
# stroke width is capped at five times that length. What the codegen passes to ManimGL.
ARROW_TIP = 0.35
ARROW_STROKE = 6
ARROW_BUFF = 0.25


def ce_arrow_values(start, end, buff, stroke_width, tip_length):
    length = float(np.linalg.norm(p3(end) - p3(start)))
    if length >= 2 * buff:
        length -= 2 * buff
    return min(tip_length, 0.25 * length), min(stroke_width, 5 * length)


cases = []


def case(name, kind, params, members):
    cases.append({"name": name, "kind": kind, "params": params, "members": [member(m) for m in members]})


for r in [1.0, 0.37, 2.2]:
    case(f"circle-{r}", "circle", {"radius": r, "center": [0, 0]}, [Circle(radius=r)])
case("circle-moved", "circle", {"radius": 0.5, "center": [1.2, -0.4]},
     [Circle(radius=0.5, arc_center=p3([1.2, -0.4]))])
case("dot", "dot", {"radius": 0.08, "center": [0, 0]}, [Dot()])
case("dot-moved", "dot", {"radius": 0.12, "center": [0.3, 0.7]}, [Dot(point=p3([0.3, 0.7]), radius=0.12)])

for w, h in [(4.0, 2.0), (1.3, 0.4), (0.5, 2.5)]:
    case(f"rect-{w}x{h}", "rect", {"width": w, "height": h, "radius": 0}, [Rectangle(width=w, height=h)])
for w, h, radius in [(4.0, 2.0, 0.5), (2.0, 1.0, 0.2), (3.0, 1.0, 0.5), (1.5, 0.9, 0.15)]:
    case(f"rounded-{w}x{h}-{radius}", "rect", {"width": w, "height": h, "radius": radius},
         [RoundedRectangle(corner_radius=radius, width=w, height=h)])

LINES = [([-1, 0], [1, 0], 0), ([-2, -1], [1.5, 0.5], 0.25), ([0, 0], [0.3, 0], 0.25), ([0.5, -1], [0.5, 1.7], 0.1)]
for start, end, buff in LINES:
    case(f"line-{start}-{end}-{buff}", "line", {"start": start, "end": end, "buff": buff},
         [Line(p3(start), p3(end), buff=buff)])

ARROWS = [
    ([-1, 0], [1, 0], {}),
    ([-2, -1], [1.5, 0.5], {}),
    ([0, 0], [0.8, 0.3], {}),
    ([-1, 0], [1, 0], {"buff": 0}),
    ([-1, 0], [1, 0], {"stroke_width": 3}),
    ([-1, 0], [1, 0], {"tip_length": 0.2}),
    ([0.2, 1], [-1.3, -0.6], {"buff": 0.1, "stroke_width": 8, "tip_length": 0.5}),
]
if lib == "ce":
    # Shorter than twice its buff: ManimCE keeps the whole line (ManimGL's Line would collapse it).
    ARROWS.append(([0, 0], [0.3, 0], {}))
for start, end, extra in ARROWS:
    buff = extra.get("buff", ARROW_BUFF)
    stroke_width = extra.get("stroke_width", ARROW_STROKE)
    tip_length = extra.get("tip_length", ARROW_TIP)
    tip, width = ce_arrow_values(start, end, buff, stroke_width, tip_length)
    params = {"start": start, "end": end, "buff": buff, "strokeWidth": stroke_width, "tipLength": tip_length,
              "tip": tip, "shaftWidth": width}
    if lib == "ce":
        arrow = Arrow(p3(start), p3(end), **extra)
        members = [arrow, arrow.tip]
    else:
        arrow = Line(p3(start), p3(end), buff=buff, stroke_width=width).add_tip(length=tip, width=tip)
        members = [arrow, arrow.tip]
    case(f"arrow-{start}-{end}-{sorted(extra.items())}", "arrow", params, members)

DECIMALS = 10 if lib == "ce" else 7  # ManimGL keeps its points as float32


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


out = rnd({"lib": lib, "cases": cases})
json.dump(out, open(f"manim-shapes-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "members", sum(len(c["members"]) for c in cases))
