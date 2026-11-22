"""Manim's curved lines and arrows, and the tips other than the triangle (D145, D146), for
geom/lines.ts: each kind between two points, as the export writes it.

  - An arc: the `path_arc=` of each class — ManimCE's `Line`, `DashedLine`, `Arrow` and
    `DoubleArrow`; ManimGL's `Line` and `DashedLine`, and for the arrows the line with its tips
    put on (below).
  - A spline: the export's `_spline` helper bends a straight line of the class into the curve
    through its nodes, given in the frame of the line's two ends; `_dashed` cuts it into dashes.
  - The tips: a triangle, ManimCE's `StealthTip` and a dot (`ArrowCircleFilledTip`), each at
    either end of a double arrow. ManimGL has the triangle and a dot half as wide as asked; the
    export's `_arrow` helper puts the tips on as ManimCE's `Arrow` and `DoubleArrow` do, and draws
    the stealth one.

In ManimGL the tip and the stroke width of an arrow are the editor's, with ManimCE's rules: the
tip capped at a quarter of the distance between the ends of the line (after its buff), the stroke
width at five times that distance, or — a double arrow — five times the distance between the
bases of its two tips.

For every case: the points of every member as the library stores them (CE: four per cubic; GL:
shared-anchor quadratics), its style, and `get_start()`, `get_end()` and `get_center()`.

Usage: run from a scratch directory:
    manim_ce/venv/bin/python <this dir>/gen_curved_lines.py ce  -> manim-curved-lines-ce.json
    manim_gl/venv/bin/python <this dir>/gen_curved_lines.py gl  -> manim-curved-lines-gl.json

It also writes manim-trace-arrow-<lib>.json (D149): bent arrows part of the way through the
export's `_TraceArrow` — the GrowArrow of a bent arrow, which neither library has —, the points of
every member at some values of its alpha.
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

    def members(m):
        return list(m.family_members_with_points())

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

    def members(m):
        return [sm for sm in m.get_family() if sm.has_points()]

    def style(m):
        return {
            "fill": [float(v) for v in m.uniforms["fill_rgba"]] if "fill_rgba" in m.uniforms
            else [float(v) for v in m.data.rows_or_defaults["fill_rgba"][0]],
            "stroke": [float(v) for v in m.data.rows_or_defaults["stroke_rgba"][0]],
            "width": float(m.get_stroke_width()),
        }


# ---- The export's helpers (export/codegen/helpers.ts holds the same text) -----------------

if lib == "ce":
    def _spline(line, curves):
        """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
        handles and the point it ends at, in the frame of the line's two ends — u along the line
        from its start (0) to its end (1), v across it to the left, as fractions of its length.
        An arrow keeps its tips, put on the curve."""
        tips = [type(tip) for tip in line.pop_tips()] if isinstance(line, Arrow) else []
        start, end = line.get_start(), line.get_end()
        along = end - start
        across = np.array([-along[1], along[0], 0.0])
        points = [start]
        for stretch in curves:
            points += [points[-1], *(start + u * along + v * across for u, v in stretch)]
        line.set_points(np.array(points[1:]))
        for shape, at_start in zip(tips, (False, True)):
            line.add_tip(tip_shape=shape, at_start=at_start)
            if not at_start:
                width = line.max_stroke_width_to_length_ratio * line.get_length()
                line.set_stroke(width=min(line.initial_stroke_width, width), family=False)
        return line

    def _dashed(line, dash_length=0.05):
        """A curve cut into dashes about `dash_length` long, counted by its own length."""
        count = max(2, int(np.ceil(line.get_arc_length() / dash_length / 2)))
        return DashedVMobject(line, num_dashes=count)

    class _TraceArrow(Animation):
        """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
        arrow about that point): its tip leads the stroke and turns with it, grown out of the
        start over the first quarter of the way; the tip at the start of a double arrow grows
        where it is."""

        def __init__(self, arrow, **kwargs):
            super().__init__(arrow, introducer=True, **kwargs)

        def along(self, alpha):
            """The point of the shaft at that part of its curves, and the way it runs there."""
            points = self.starting_mobject.points
            index, t = integer_interpolate(0, len(points) // 4, alpha)
            curve = points[4 * index:4 * index + 4]
            return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

        def interpolate_submobject(self, submob, start, alpha):
            if submob is self.mobject:
                submob.pointwise_become_partial(start, 0, alpha)
                return
            base = start.base
            submob.set_points(start.points)
            if submob is self.mobject.tip:
                (at, way), (_, ahead) = self.along(alpha), self.along(1)
                if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                    submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
                submob.shift(at - base)
                base = at
            submob.scale(min(1, 4 * alpha), about_point=base)
else:
    def _arrow(line, tip=0.35, end="triangle", start=None):
        """Put a tip `tip` long at the end of a line, and one at its start when `start` names
        its shape, as ManimCE's Arrow and DoubleArrow put theirs: each with its point on the end of
        the line and along the line there, the line then running between their bases. The shapes:
        "triangle", "stealth" (ManimCE's StealthTip) and "dot"."""
        if tip <= 0:
            return line

        def make(shape, at_start=False):
            if shape == "dot":  # ManimGL makes its dot half as wide as it is asked
                return line.create_tip(at_start, length=2 * tip, tip_style=2)
            mob = line.create_tip(at_start, length=tip, width=tip)
            if shape == "stealth":
                corners = [[2, 0, 0], [-1.2, 1.6, 0], [0, 0, 0], [-1.2, -1.6, 0], [2, 0, 0]]
                mob.set_points_as_corners(tip / 3.2 * np.array(corners))
                mob.set_stroke(width=3.0)
                line.position_tip(mob, at_start)
            return mob

        first, last = line.get_start(), line.get_end()
        front = make(end)
        line.put_start_and_end_on(first, front.get_base())
        tips = [front]
        if start:
            # ManimCE makes the second tip on the line the first one has shortened, and turns
            # the first one with the line when the second shortens it.
            back = make(start, True)
            turn = angle_of_vector(last - back.get_base()) - angle_of_vector(last - first)
            front.rotate(turn, about_point=last)
            line.put_start_and_end_on(back.get_base(), front.get_base())
            line.start_tip = back
            tips.append(back)
        line.tip = front
        for mob in tips:
            mob.set_color(line.get_stroke_color())
            line.add(mob)
        return line

    def _spline(line, curves):
        """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
        handles and the point it ends at, in the frame of the line's two ends — u along the line
        from its start (0) to its end (1), v across it to the left, as fractions of its length.
        ManimGL draws quadratic curves: each stretch, a cubic one, is made of eight."""
        start, end = line.get_start(), line.get_end()
        along = end - start
        across = np.array([-along[1], along[0], 0.0])
        t = np.linspace(0, 1, 9)[:, None]
        points = [start]
        for stretch in curves:
            p0 = points[-1]
            p1, p2, p3 = (start + u * along + v * across for u, v in stretch)
            at = ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
                  + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
            way = (1 - t) ** 2 * (p1 - p0) + 2 * (1 - t) * t * (p2 - p1) + t ** 2 * (p3 - p2)
            for a, b, da, db in zip(at, at[1:], way, way[1:]):
                # The handle of each eighth: where the tangents at its two ends meet, when they
                # meet between them; else — the curve runs straight there, or turns its bend —
                # the handle of the quadratic nearest to the eighth.
                handle = (a + b) / 2 + 3 * (da - db) / 32
                turn = da[0] * db[1] - da[1] * db[0]
                if abs(turn) > 1e-4 * get_norm(da) * get_norm(db):
                    gap = b - a
                    s = (gap[0] * db[1] - gap[1] * db[0]) / turn
                    u = (da[0] * gap[1] - da[1] * gap[0]) / turn
                    met = a + s * da
                    if s > 0 and u > 0 and get_norm(met - (a + b) / 2) <= get_norm(gap):
                        handle = met
                points += [handle, b]
        line.set_points(np.array(points))
        return line

    def _dashed(line, dash_length=0.05):
        """A curve cut into dashes about `dash_length` long, counted by its own length, as
        ManimCE's DashedVMobject cuts it: dashes of one length, the first at the start of the
        curve and the last at its end."""
        alphas = np.linspace(0, 1, 9 * line.get_num_curves() + 1)
        points = np.array([line.quick_point_from_proportion(a) for a in alphas])
        lengths = np.append(0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
        count = max(2, int(np.ceil(lengths[-1] / dash_length / 2)))
        period = 0.5 / count + 0.5 / (count - 1)
        dashes = [
            line.get_subcurve(*np.interp(
                np.array([i * period, i * period + 0.5 / count]) * lengths[-1], lengths, alphas
            ))
            for i in range(count)
        ]
        line.clear_points()
        line.add(*dashes)
        return line

    class _TraceArrow(Animation):
        """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
        arrow about that point): its tip leads the stroke and turns with it, grown out of the
        start over the first quarter of the way; the tip at the start of a double arrow grows
        where it is."""

        def along(self, alpha):
            """The point of the shaft at that part of its curves, and the way it runs there."""
            points = self.starting_mobject.get_points()
            index, t = integer_interpolate(0, len(points) // 2, alpha)
            curve = points[2 * index:2 * index + 3]
            return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

        def interpolate_submobject(self, submob, start, alpha):
            if submob is self.mobject:
                submob.pointwise_become_partial(start, 0, alpha)
                return
            base = start.get_base()
            submob.match_points(start)
            if submob is self.mobject.tip:
                (at, way), (_, ahead) = self.along(alpha), self.along(1)
                if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                    submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
                submob.shift(at - base)
                base = at
            submob.scale(min(1, 4 * alpha), about_point=base)


LINE_STROKE = 4
ARROW_STROKE = 6
ARROW_TIP = 0.35
TIP_BASE = {"triangle": 1.0, "stealth": 0.625, "dot": 1.0}
if lib == "ce":
    TIP_SHAPES = {
        "triangle": ArrowTriangleFilledTip, "stealth": StealthTip, "dot": ArrowCircleFilledTip,
    }


def p3(p):
    return np.array([p[0], p[1], 0.0])


def dist(a, b):
    return float(np.linalg.norm(np.array(a)[:2] - np.array(b)[:2]))


def build(kind, start, end, buff, arc, spline, options):
    """The mobject of `kind` between two points as the export writes it, and (ManimGL) the
    values the editor passes for an arrow."""
    stroke = options.get("stroke_width", ARROW_STROKE if "arrow" in kind else LINE_STROKE)
    tip_length = options.get("tip_length", ARROW_TIP)
    dash = options.get("dash_length", 0.2)
    tips = options.get("tips", ("triangle", "triangle"))
    curve = {} if arc is None else {"path_arc": arc * DEGREES}
    spline = stretches(spline) if spline else None
    values = {}
    if kind == "line":
        m = Line(start, end, buff=buff, stroke_width=stroke, **curve)
        if spline:
            m = _spline(m, spline)
    elif kind == "dashed":
        if spline:
            m = _dashed(_spline(Line(start, end, buff=buff, stroke_width=stroke), spline), dash)
        else:
            m = DashedLine(start, end, buff=buff, stroke_width=stroke, dash_length=dash, **curve)
    elif lib == "ce":
        if kind == "arrow":
            m = Arrow(start, end, buff=buff, stroke_width=stroke, tip_length=tip_length,
                      tip_shape=TIP_SHAPES[tips[0]], **curve)
        else:
            m = DoubleArrow(start, end, buff=buff, stroke_width=stroke, tip_length=tip_length,
                            tip_shape_end=TIP_SHAPES[tips[0]],
                            tip_shape_start=TIP_SHAPES[tips[1]], **curve)
        if spline:
            m = _spline(m, spline)
    else:
        def bare(width):
            line = Line(start, end, buff=buff, stroke_width=width, **curve)
            return _spline(line, spline) if spline else line

        # The editor's values, ManimCE's rules: from the distance between the ends of the line.
        probe = bare(stroke)
        chord = dist(probe.get_start(), probe.get_end())
        tip = min(tip_length, 0.25 * chord)
        if tip <= 0:
            m = bare(min(stroke, 5 * chord))
            width = min(stroke, 5 * chord)
        elif kind == "arrow":
            width = min(stroke, 5 * chord)
            if tips[0] == "triangle":
                m = bare(width).add_tip(length=tip, width=tip)
            elif tips[0] == "dot":
                m = bare(width).add_tip(length=2 * tip, tip_style=2)
            else:
                m = _arrow(bare(width), tip, tips[0])
        else:
            shaft = _arrow(bare(stroke), tip, tips[0], tips[1])
            between = dist(shaft.get_points()[0], shaft.get_points()[-1])
            width = min(stroke, 5 * between)
            m = _arrow(bare(width), tip, tips[0], tips[1])
        values = {"tip": tip, "shaftWidth": width}
    return m, {"strokeWidth": stroke, "tipLength": tip_length, "dashLength": dash,
               "tips": list(tips), **values}


def v2(p):
    return [float(p[0]), float(p[1])]


def member(m):
    return {"cls": type(m).__name__, "points": pts(m), **style(m)}


def read(point_of):
    try:
        return v2(point_of())
    except Exception:
        return None


def case(name, kind, start, end, buff, arc, spline, options):
    m, values = build(kind, p3(start), p3(end), buff, arc, spline, options)
    return {
        "name": name, "kind": kind, "from": start, "to": end, "buff": buff,
        "arc": arc, "spline": spline, **values,
        "members": [member(sm) for sm in members(m)],
        "start": read(m.get_start),
        "end": read(m.get_end),
        "center": read(m.get_center),
    }


LONG = ([-2.0, -0.5], [2.0, 1.0])
SHORT = ([0.0, 0.0], [0.5, 0.3])
ARCS = [30, -30, 90, -135, 200]
SHAPES = ["triangle", "stealth", "dot"]
PAIRS = [("triangle", "triangle"), ("stealth", "dot"), ("dot", "stealth"), ("triangle", "dot")]
# Splines as the editor holds them, in the frame of the two ends: nodes, each an anchor with the
# handle before it and the handle after it (None: none). An S with both handles, a bow whose last
# node has no handle, and three nodes with a corner in the middle and a first stretch without
# handles.
SPLINES = {
    "s": [
        {"at": [0, 0], "in": None, "out": [0.3, 0.4]},
        {"at": [1, 0], "in": [0.7, -0.4], "out": None},
    ],
    "bow": [
        {"at": [0, 0], "in": None, "out": [0.25, 0.5]},
        {"at": [1, 0], "in": None, "out": None},
    ],
    "corner": [
        {"at": [0, 0], "in": None, "out": None},
        {"at": [0.35, 0.3], "in": None, "out": [0.5, 0.45]},
        {"at": [1, 0], "in": [0.9, 0.35], "out": None},
    ],
}


def stretches(nodes):
    """What the export writes of a spline (geom/lines.ts, `splineStretches`): for each stretch
    its two handles and the anchor it ends at. A handle that is not there sits a third of the way
    to the next control point of the stretch: the other handle, or the other anchor."""
    out = []
    for a, b in zip(nodes, nodes[1:]):
        p0, p3 = np.array(a["at"], float), np.array(b["at"], float)
        h1 = None if a["out"] is None else np.array(a["out"], float)
        h2 = None if b["in"] is None else np.array(b["in"], float)
        p1 = h1 if h1 is not None else p0 + ((p3 if h2 is None else h2) - p0) / 3
        p2 = h2 if h2 is not None else p3 + ((p0 if h1 is None else h1) - p3) / 3
        out.append([[float(v) for v in p] for p in (p1, p2, p3)])
    return out


def variants():
    """Every kind, with each shape of tip at the end of an arrow and each pair on a double one."""
    yield "line", {}
    yield "dashed", {}
    for shape in SHAPES:
        yield "arrow", {"tips": (shape, "triangle")}
    for pair in PAIRS:
        yield "double_arrow", {"tips": pair}


cases = []
for chord_name, (start, end) in (("long", LONG), ("short", SHORT)):
    for buff in (0.0, 0.25):
        # Straight: the tips that are not the triangle (gen_lines.py has the rest).
        for kind, options in variants():
            if kind in ("line", "dashed") or options["tips"] == ("triangle", "triangle"):
                continue
            cases.append(case(f"straight {chord_name}", kind, start, end, buff, None, None,
                              options))
        # The short chord takes fewer: what it adds is the caps of a short arrow and a buff
        # that leaves little of the line.
        for arc in (ARCS if chord_name == "long" else ARCS[1:4:2]):
            for kind, options in variants():
                cases.append(case(f"arc {arc} {chord_name}", kind, start, end, buff, arc, None,
                                  options))
        for spline_name, nodes in SPLINES.items():
            if chord_name == "short" and spline_name != "s":
                continue
            for kind, options in variants():
                cases.append(case(f"spline {spline_name} {chord_name}", kind, start, end, buff,
                                  None, nodes, options))

# Odd ones: an arc so slight that ManimGL draws a straight line, and other widths and lengths.
ODD = [
    ("slight", LONG, 0.0, 0.05, None, {}),
    ("thick", LONG, 0.1, 60, None, {"stroke_width": 9, "tip_length": 0.5, "dash_length": 0.31}),
    ("thin", SHORT, 0.0, -60, None, {"stroke_width": 2, "tip_length": 0.2, "dash_length": 0.05}),
    ("thick spline", LONG, 0.1, None, SPLINES["s"],
     {"stroke_width": 9, "tip_length": 0.5, "dash_length": 0.31}),
]
for name, (start, end), buff, arc, spline, options in ODD:
    for kind, shapes in variants():
        cases.append(case(name, kind, start, end, buff, arc, spline, {**options, **shapes}))

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32: 7 decimals is its noise


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, (list, tuple)):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


out = rnd({"lib": lib, "cases": cases})
json.dump(out, open(f"manim-curved-lines-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(cases), "members", sorted({len(c["members"]) for c in cases}))


# ---- The GrowArrow of a bent arrow (D149): the export's `_TraceArrow`, part of the way --------

TRACE_ALPHAS = [0.1, 0.25, 0.6, 1.0]
TRACE_WAYS = [
    ("arc 30", LONG, 0.0, 30, None),
    ("arc -135", LONG, 0.25, -135, None),
    ("arc 200 short", SHORT, 0.0, 200, None),
    ("spline s", LONG, 0.0, None, SPLINES["s"]),
    ("spline corner", LONG, 0.25, None, SPLINES["corner"]),
]
TRACE_TIPS = [
    ("arrow", ("triangle", "triangle")),
    ("arrow", ("stealth", "triangle")),
    ("arrow", ("dot", "triangle")),
    ("double_arrow", ("triangle", "triangle")),
    ("double_arrow", ("stealth", "dot")),
]


def traced(name, kind, start, end, buff, arc, spline, options):
    frames = []
    for alpha in TRACE_ALPHAS:
        m, values = build(kind, p3(start), p3(end), buff, arc, spline, options)
        animation = _TraceArrow(m, rate_func=linear)
        animation.begin()
        animation.interpolate(alpha)
        frames.append({"alpha": alpha, "members": [pts(sm) for sm in members(m)]})
    return {
        "name": name, "kind": kind, "from": start, "to": end, "buff": buff,
        "arc": arc, "spline": spline, **values, "frames": frames,
    }


traces = [
    traced(name, kind, start, end, buff, arc, spline, {"tips": tips})
    for name, (start, end), buff, arc, spline in TRACE_WAYS
    for kind, tips in TRACE_TIPS
]
json.dump(rnd({"lib": lib, "cases": traces}), open(f"manim-trace-arrow-{lib}.json", "w"),
          separators=(",", ":"))
print(lib, "traced", len(traces))
