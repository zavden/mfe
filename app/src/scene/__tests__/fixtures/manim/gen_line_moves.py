"""What Manim plays for a tween that carries the ends of a line (D144), for scene/lineStates.ts
and scene/anim/ends.ts: each kind of line between two points — straight, an arc, a spline, with
the tips the editor has —, carried to two other points as the export writes it.

  - An arrow and a double arrow: `Transform(arrow, new_arrow)`, the new one built between the
    new ends by the constructor of its class (ManimGL: the line with its tips put on, at the tip
    and the stroke width ManimCE's rules give its new length). So is a line whose arc takes other
    degrees: `Transform(line, Line(a, b, path_arc=…))`.
  - A line and a dashed line: `line.animate.put_start_and_end_on(a, b).set_stroke(width=…)`.
    The dashes of a spline have no ends for it to read: the export's `_carried` helper makes the
    copy it would, and `Transform` plays it.

For every case, at some values of the animation's alpha (its rate linear): the points of every
member as the library stores them and its stroke width; and, once it has ended, `get_center()`.

The mobjects are built by gen_curved_lines.py's `build` (this file runs its text up to its own
cases), so the helpers are the ones that file holds.

Usage: run from a scratch directory:
    manim_ce/venv/bin/python <this dir>/gen_line_moves.py ce  -> manim-line-moves-ce.json
    manim_gl/venv/bin/python <this dir>/gen_line_moves.py gl  -> manim-line-moves-gl.json
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
source = open(os.path.join(HERE, "gen_curved_lines.py")).read()
exec(compile(source[:source.index("\ncases = []\n")], "gen_curved_lines.py", "exec"))

# ---- The export's helper (export/codegen/helpers.ts holds the same text) ------------------


def _carried(line, start, end):
    """A copy of a line cut into dashes, carried to run from `start` to `end` as
    put_start_and_end_on carries a line: the dashes of a curve have no points of their own for
    it to read the two ends from."""
    carried = line.copy()
    first = carried.submobjects[0].get_start()
    was = carried.submobjects[-1].get_end() - first
    now = np.array(end) - np.array(start)
    carried.scale(np.linalg.norm(now) / np.linalg.norm(was), about_point=first)
    carried.rotate(angle_of_vector(now) - angle_of_vector(was), about_point=first)
    return carried.shift(np.array(start) - first)


# ---- The cases ----------------------------------------------------------------------------

ALPHAS = [0.4, 1.0]
FROM = ([-2.0, -0.5], [2.0, 1.0])
TARGETS = {"long": ([-1.0, -1.0], [3.0, 2.0]), "short": ([0.5, 0.0], [0.5, 0.6])}
# name, arc, spline, the degrees the tween gives an arc (None: its own)
WAYS = [
    ("straight", None, None, None),
    ("arc 60", 60, None, None),
    ("arc 60 to 150", 60, None, 150),
    ("arc 60 to -45", 60, None, -45),
    ("spline s", None, SPLINES["s"], None),
]
KINDS = [
    ("line", ("triangle", "triangle")),
    ("dashed", ("triangle", "triangle")),
    ("arrow", ("triangle", "triangle")),
    ("arrow", ("stealth", "triangle")),
    ("double_arrow", ("triangle", "triangle")),
    ("double_arrow", ("dot", "stealth")),
]


def width_of(m):
    w = m.get_stroke_width()
    return float(np.max(w)) if np.ndim(w) else float(w)


def moved(name, kind, tips, arc, spline, degrees, target_name, width):
    (a0, a1), (b0, b1) = FROM, TARGETS[target_name]
    options = {"tips": tips, "dash_length": 0.2}
    frames = []
    for alpha in ALPHAS:
        m, values = build(kind, p3(a0), p3(a1), 0.0, arc, spline, options)
        rebuilt = "arrow" in kind or (kind == "line" and degrees is not None)
        if rebuilt:
            new_arc = arc if degrees is None else degrees
            asked = {**options, **({} if width is None else {"stroke_width": width})}
            target, _ = build(kind, p3(b0), p3(b1), 0.0, new_arc, spline, asked)
            animation = Transform(m, target)
        elif kind == "dashed" and spline:
            target = _carried(m, p3(b0), p3(b1))
            if width is not None:
                target.set_stroke(width=width)
            animation = Transform(m, target)
        else:
            builder = m.animate.put_start_and_end_on(p3(b0), p3(b1))
            if width is not None:
                builder = builder.set_stroke(width=width)
            animation = builder.build()
        animation.rate_func = linear
        animation.begin()
        animation.interpolate(alpha)
        frames.append({
            "alpha": alpha,
            "members": [{"points": pts(sm), "width": width_of(sm)} for sm in members(m)],
        })
    return {
        "name": name, "kind": kind, "from": [a0, a1], "to": [b0, b1], "arc": arc,
        "spline": spline, "degrees": degrees, "toWidth": width, **values,
        "frames": frames, "center": v2(m.get_center()),
    }


cases = []
for kind, tips in KINDS:
    for name, arc, spline, degrees in WAYS:
        # A dashed line is only ever carried: its arc keeps its degrees.
        if kind == "dashed" and degrees is not None:
            continue
        for target_name in TARGETS:
            # The short one with another stroke width: an arrow caps the one it is asked.
            width = None if target_name == "long" else (2.0 if "arrow" not in kind else 9.0)
            cases.append(moved(f"{name} {target_name}", kind, tips, arc, spline, degrees,
                               target_name, width))

DECIMALS = 9 if lib == "ce" else 7  # ManimGL keeps its points as float32: 7 decimals is its noise


def rnd(x):
    if isinstance(x, float):
        return round(x, DECIMALS)
    if isinstance(x, (list, tuple)):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x


json.dump(rnd({"lib": lib, "cases": cases}), open(f"manim-line-moves-{lib}.json", "w"),
          separators=(",", ":"))
print(lib, "moved", len(cases))
