"""Sample Manim's own animations on a small polygon "formula" (works for CE and GL).

Usage: run from a scratch directory (Manim writes `media/` into the cwd) with this directory on
PYTHONPATH, then move the JSON files next to the tests (one directory up):
    PYTHONPATH=<this dir> manim_ce/venv/bin/python <this dir>/gen_anim.py ce   -> manim-anim-ce.json
    PYTHONPATH=<this dir> manim_gl/venv/bin/python <this dir>/gen_anim.py gl   -> manim-anim-gl.json
    manim_ce/venv/bin/python <this dir>/gen_partial.py                         -> manim-partial-ce.json
    manim_gl/venv/bin/python <this dir>/gen_color_gl.py                        -> manim-color-gl.json
"""
import json, sys
import numpy as np
from geometry import centred, COLORS


def rnd(x, digits=7):
    """Round every float in a JSON-like structure (keeps the fixtures small and diff-friendly)."""
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x

lib = sys.argv[1]  # ce | gl
ALPHAS = [0.0, 0.04, 0.2, 0.33, 0.5, 0.61, 0.8, 0.97, 1.0]
N = 5

if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    from manim.utils import rate_functions as rf
    rate = {"linear": rf.linear, "smooth": rf.smooth, "rush_into": rf.rush_into,
            "double_smooth": rf.double_smooth, "slow_into": rf.slow_into, "there_and_back": rf.there_and_back,
            "rush_from": rf.rush_from}
else:
    from manimlib import *  # noqa
    from manimlib.utils import rate_functions as rf
    rate = {"linear": rf.linear, "smooth": rf.smooth, "rush_into": rf.rush_into,
            "double_smooth": rf.double_smooth, "slow_into": rf.slow_into, "there_and_back": rf.there_and_back,
            "rush_from": rf.rush_from}


def build():
    glyphs = []
    for poly, col in zip(centred(), COLORS):
        pts = [np.array([x, y, 0.0]) for x, y in poly] + [np.array([poly[0][0], poly[0][1], 0.0])]
        g = VMobject()
        g.set_points_as_corners(pts)
        if lib == "ce":
            g.set_fill(col, opacity=1.0)
            g.set_stroke(col, width=0, opacity=1.0)
        else:
            g.set_fill(col, opacity=1.0)
            g.set_stroke(col, width=0, opacity=1.0)
        glyphs.append(g)
    if lib == "ce":
        top = VGroup(VGroup(*glyphs))
    else:
        # A Tex is a childless VMobject holding the glyphs; its own colour stays the default white.
        top = VMobject()
        top.add(*glyphs)
        top.set_color(WHITE, recurse=False)
    return top, glyphs


def rgba_of(g):
    if lib == "ce":
        f = np.array(g.get_fill_rgbas()[0], dtype=float)
        s = np.array(g.get_stroke_rgbas()[0], dtype=float)
        w = float(g.get_stroke_width())
    else:
        f = np.array(g.uniforms["fill_rgba"], dtype=float)
        s = np.array(g.data.rows_or_defaults["stroke_rgba"][0], dtype=float)
        w = float(g.get_stroke_width())
    return f.tolist(), s.tolist(), w


def curves_of(g):
    if lib == "ce":
        pts = np.array(g.points)
        out = []
        for i in range(0, len(pts), 4):
            out.append([float(pts[i][0]), float(pts[i][1]), float(pts[i + 3][0]), float(pts[i + 3][1])])
        return out
    pts = np.array(g.get_points())
    out = []
    for i in range(0, len(pts) - 2, 2):
        out.append([float(pts[i][0]), float(pts[i][1]), float(pts[i + 2][0]), float(pts[i + 2][1])])
    return out


def sample(make_anim, alpha):
    top, glyphs = build()
    anim = make_anim(top)
    anim.begin()
    anim.interpolate(alpha)
    ids = {id(g): i for i, g in enumerate(glyphs)}
    rows = [None] * N
    for g in glyphs:
        f, s, w = rgba_of(g)
        rows[ids[id(g)]] = {"curves": curves_of(g), "fill": f, "stroke": s, "width": w}
    return rows


CASES = []
def case(name, kind, easing, lag, make, params=None):
    CASES.append({"name": name, "kind": kind, "easing": easing, "lag": lag, "params": params or {}, "make": make})

def kw(easing, lag):
    d = {"rate_func": rate[easing]}
    if lag is not None:
        d["lag_ratio"] = lag
    return d

CENTER_DOWN = np.array([0.0, -1.0, 0.0])
for easing, lag in [("linear", None), ("smooth", 0.3)]:
    case(f"write-{easing}-{lag}", "write", easing, lag, lambda m, e=easing, l=lag: Write(m, **kw(e, l)))
for easing, lag in [("double_smooth", None), ("rush_into", 0.25)]:
    case(f"dbtf-{easing}-{lag}", "draw_border_then_fill", easing, lag,
         lambda m, e=easing, l=lag: DrawBorderThenFill(m, **kw(e, l)))
create_cls = Create if lib == "ce" else ShowCreation
for easing, lag in [("smooth", None), ("linear", 0.4)]:
    case(f"create-{easing}-{lag}", "create", easing, lag, lambda m, e=easing, l=lag: create_cls(m, **kw(e, l)))
for easing, lag in [("smooth", None), ("there_and_back", 0.3)]:
    case(f"fade_in-{easing}-{lag}", "fade_in", easing, lag,
         lambda m, e=easing, l=lag: FadeIn(m, shift=np.array([0.5, -1.0, 0.0]), scale=1.5, **kw(e, l)),
         {"shift": [0.5, -1.0], "scale": 1.5})
for easing, lag in [("smooth", None), ("rush_from", 0.2)]:
    case(f"grow-{easing}-{lag}", "grow_from_center", easing, lag,
         lambda m, e=easing, l=lag: GrowFromCenter(m, **kw(e, l)))
for easing, lag in [("smooth", None), ("slow_into", 0.35)]:
    case(f"fade_out-{easing}-{lag}", "fade_out", easing, lag,
         lambda m, e=easing, l=lag: FadeOut(m, shift=np.array([-0.4, 0.7, 0.0]), scale=0.5, **kw(e, l)),
         {"shift": [-0.4, 0.7], "scale": 0.5})
for easing, lag in [("smooth", None), ("linear", 0.3)]:
    case(f"shrink-{easing}-{lag}", "shrink_to_center", easing, lag,
         lambda m, e=easing, l=lag: ShrinkToCenter(m, **kw(e, l)))
if lib == "ce":
    # Unwrite itself ignores a `rate_func` argument (it never forwards it to Write), so the
    # non-linear case uses the equivalent Write(reverse=True, reverse_rate_function=True) form.
    case("unwrite-linear-None", "unwrite", "linear", None, lambda m: Unwrite(m))
    case("unwrite-smooth-0.3", "unwrite", "smooth", 0.3,
         lambda m: Write(m, reverse=True, reverse_rate_function=True, rate_func=rate["smooth"], lag_ratio=0.3, remover=True))
    for easing, lag in [("smooth", None), ("rush_into", 0.3)]:
        case(f"uncreate-{easing}-{lag}", "uncreate", easing, lag,
             lambda m, e=easing, l=lag: Uncreate(m, rate_func=rate[e], **({"lag_ratio": l} if l is not None else {})))
else:
    # GL: Uncreate has rate_func = smooth(1 - t); a custom easing e becomes e(1 - t).
    for easing, lag in [("smooth", None), ("rush_into", 0.3)]:
        case(f"uncreate-{easing}-{lag}", "uncreate", easing, lag,
             lambda m, e=easing, l=lag: Uncreate(m, rate_func=(lambda t, e=e: rate[e](1 - t)), **({"lag_ratio": l} if l is not None else {})))
    # GL has no Unwrite: reversed Write = reversed glyph order + rate_func(1 - t), lag from the Write default.
    def gl_unwrite(m, e, l):
        rev = VMobject()
        rev.add(*reversed(list(m.submobjects)))
        rev.set_color(WHITE, recurse=False)
        extra = {} if l is None else {"lag_ratio": l}
        return Write(rev, rate_func=(lambda t, e=e: rate[e](1 - t)), remover=True, **extra)
    for easing, lag in [("linear", None), ("smooth", 0.3)]:
        case(f"unwrite-{easing}-{lag}", "unwrite", easing, lag, lambda m, e=easing, l=lag: gl_unwrite(m, e, l))

out = {"lib": lib, "alphas": ALPHAS, "polygons": centred(), "colors": COLORS, "cases": []}
for c in CASES:
    samples = []
    for a in ALPHAS:
        try:
            rows = sample(c["make"], a)
        except Exception as ex:  # surface failures loudly
            raise RuntimeError(f"{c['name']} @ {a}: {ex!r}")
        samples.append({"alpha": a, "glyphs": rows})
    out["cases"].append({k: c[k] for k in ("name", "kind", "easing", "lag", "params")} | {"samples": samples})
json.dump(rnd(out), open(f"manim-anim-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(out["cases"]))

