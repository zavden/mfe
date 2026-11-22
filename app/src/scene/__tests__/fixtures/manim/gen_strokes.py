"""Sample Manim's own animations and transforms on a "formula" of stroked and filled shapes (works
for CE and GL), for the looks with a style of their own (scene/anim/looks.ts) and the morph's
stroke (scene/anim/morph.ts): a stroked circle, a filled polygon like a glyph, a rectangle painted
both ways, a thick line, a dot and a filled box with no stroke at all.

Usage: run from a scratch directory (Manim writes `media/` into the cwd):
    manim_ce/venv/bin/python <this dir>/gen_strokes.py ce   -> manim-strokes-ce.json
    manim_gl/venv/bin/python <this dir>/gen_strokes.py gl   -> manim-strokes-gl.json
"""
import json, sys
import numpy as np

lib = sys.argv[1]  # ce | gl
ALPHAS = [0.0, 0.04, 0.2, 0.33, 0.5, 0.61, 0.8, 0.97, 1.0]
MORPH_ALPHAS = [0.0, 0.15, 0.4, 0.5, 0.75, 1.0]

if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    from manim.utils import rate_functions as rf
else:
    from manimlib import *  # noqa
    from manimlib.utils import rate_functions as rf

RATE = {"linear": rf.linear, "smooth": rf.smooth, "double_smooth": rf.double_smooth,
        "rush_into": rf.rush_into, "there_and_back": rf.there_and_back}


def rnd(x, digits=7):
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x


def p3(xy):
    return np.array([xy[0], xy[1], 0.0])


RED, BLUE, GREEN, YEL, ORG, PUR = "#FC6255", "#58C4DD", "#83C167", "#FFFF00", "#FF862F", "#C55FFB"

# The members: a builder, a colour and the style (fill opacity, stroke width, stroke opacity).
MEMBERS = [
    ("circle", lambda: Circle(radius=0.6).shift(p3([-2.6, 0.2])), RED, (0.0, 4.0, 1.0)),
    ("glyph", lambda: Polygon(p3([-1.6, -0.4]), p3([-1.0, -0.3]), p3([-1.1, 0.5]), p3([-1.7, 0.4])), BLUE,
     (1.0, 0.0, 1.0)),
    ("both", lambda: Rectangle(width=1.2, height=0.7).shift(p3([0.1, 0.1])), GREEN, (0.5, 2.0, 1.0)),
    ("line", lambda: Line(p3([1.0, -0.5]), p3([1.9, 0.6])), YEL, (0.0, 6.0, 1.0)),
    ("dot", lambda: Dot(point=p3([2.5, 0.1]), radius=0.15), ORG, (1.0, 0.0, 1.0)),
    ("box", lambda: Rectangle(width=0.6, height=0.4).shift(p3([3.3, -0.2])), PUR, (0.75, 0.0, 0.0)),
]
N = len(MEMBERS)


def styled(m, color, style):
    fill_opacity, width, stroke_opacity = style
    m.set_fill(color, opacity=fill_opacity)
    m.set_stroke(color, width=width, opacity=stroke_opacity)
    return m


def build():
    glyphs = [styled(make(), color, style) for _, make, color, style in MEMBERS]
    if lib == "ce":
        top = VGroup(VGroup(*glyphs))
    else:
        top = VMobject()
        top.add(*glyphs)
        top.set_color(WHITE, recurse=False)
    return top, glyphs


def rgba_of(g):
    if lib == "ce":
        f = np.array(g.get_fill_rgbas()[0], dtype=float)
        s = np.array(g.get_stroke_rgbas()[0], dtype=float)
    else:
        f = np.array(g.uniforms["fill_rgba"], dtype=float)
        s = np.array(g.data.rows_or_defaults["stroke_rgba"][0], dtype=float)
    return f.tolist(), s.tolist(), float(g.get_stroke_width())


def points_of(g):
    pts = np.array(g.points if lib == "ce" else g.get_points())
    return pts[:, :2].tolist()


def curves_of(g):
    pts = np.array(g.points if lib == "ce" else g.get_points())
    out = []
    if lib == "ce":
        for i in range(0, len(pts), 4):
            out.append([float(pts[i][0]), float(pts[i][1]), float(pts[i + 3][0]), float(pts[i + 3][1])])
    else:
        for i in range(0, len(pts) - 2, 2):
            out.append([float(pts[i][0]), float(pts[i][1]), float(pts[i + 2][0]), float(pts[i + 2][1])])
    return out


def sample(make_anim, alpha):
    top, glyphs = build()
    anim = make_anim(top)
    anim.begin()
    anim.interpolate(alpha)
    rows = []
    for g in glyphs:
        f, s, w = rgba_of(g)
        rows.append({"curves": curves_of(g), "fill": f, "stroke": s, "width": w})
    return rows


CASES = []


def case(name, kind, easing, lag, make, params=None):
    CASES.append({"name": name, "kind": kind, "easing": easing, "lag": lag, "params": params or {}, "make": make})


def kw(easing, lag):
    d = {"rate_func": RATE[easing]}
    if lag is not None:
        d["lag_ratio"] = lag
    return d


case("write-linear-None", "write", "linear", None, lambda m: Write(m, **kw("linear", None)))
case("write-smooth-0.3", "write", "smooth", 0.3, lambda m: Write(m, **kw("smooth", 0.3)))
case("dbtf-double_smooth-None", "draw_border_then_fill", "double_smooth", None,
     lambda m: DrawBorderThenFill(m, **kw("double_smooth", None)))
create_cls = Create if lib == "ce" else ShowCreation
case("create-smooth-None", "create", "smooth", None, lambda m: create_cls(m, **kw("smooth", None)))
case("create-linear-0.4", "create", "linear", 0.4, lambda m: create_cls(m, **kw("linear", 0.4)))
case("fade_in-smooth-None", "fade_in", "smooth", None,
     lambda m: FadeIn(m, shift=p3([0.5, -1.0]), scale=1.5, **kw("smooth", None)), {"shift": [0.5, -1.0], "scale": 1.5})
case("grow-smooth-None", "grow_from_center", "smooth", None, lambda m: GrowFromCenter(m, **kw("smooth", None)))
case("fade_out-smooth-None", "fade_out", "smooth", None,
     lambda m: FadeOut(m, shift=p3([-0.4, 0.7]), scale=0.5, **kw("smooth", None)), {"shift": [-0.4, 0.7], "scale": 0.5})
case("shrink-smooth-None", "shrink_to_center", "smooth", None, lambda m: ShrinkToCenter(m, **kw("smooth", None)))
if lib == "ce":
    case("unwrite-linear-None", "unwrite", "linear", None, lambda m: Unwrite(m))
    case("uncreate-smooth-None", "uncreate", "smooth", None, lambda m: Uncreate(m, rate_func=RATE["smooth"]))
else:
    case("uncreate-smooth-None", "uncreate", "smooth", None,
         lambda m: Uncreate(m, rate_func=(lambda t: RATE["smooth"](1 - t))))

    def gl_unwrite(m):
        rev = VMobject()
        rev.add(*reversed(list(m.submobjects)))
        rev.set_color(WHITE, recurse=False)
        return Write(rev, rate_func=(lambda t: RATE["linear"](1 - t)), remover=True)
    case("unwrite-linear-None", "unwrite", "linear", None, gl_unwrite)

# The members as built (the "render" of the test): points as the library holds them.
_, built = build()
glyphs = []
for (name, _, color, style), g in zip(MEMBERS, built):
    glyphs.append({"name": name, "color": color, "fillOpacity": style[0], "strokeWidth": style[1],
                   "strokeOpacity": style[2], "points": points_of(g)})

out = {"lib": lib, "alphas": ALPHAS, "glyphs": glyphs, "cases": [], "morphs": []}
for c in CASES:
    samples = []
    for a in ALPHAS:
        try:
            rows = sample(c["make"], a)
        except Exception as ex:
            raise RuntimeError(f"{c['name']} @ {a}: {ex!r}")
        samples.append({"alpha": a, "glyphs": rows})
    out["cases"].append({k: c[k] for k in ("name", "kind", "easing", "lag", "params")} | {"samples": samples})


# Transforms between members of different styles: every family member with points, as
# gen_morph.py records them, so the morph's stroke interpolation can be checked.
def member(index):
    name, make, color, style = MEMBERS[index]
    return styled(make(), color, style)


def pieces_of(top):
    members = top.family_members_with_points() if lib == "ce" else [x for x in top.get_family() if x.has_points()]
    rows = []
    for m in members:
        f, s, w = rgba_of(m)
        rows.append({"points": points_of(m), "fill": f, "stroke": s, "width": w})
    return rows


def morph(name, style, src, dst, easing="smooth"):
    samples = []
    for a in MORPH_ALPHAS:
        s = member(src)
        d = member(dst)
        kwargs = {"rate_func": RATE[easing], "path_arc": 0.0}
        if style == "transform":
            anim = ReplacementTransform(s, d, **kwargs)
        elif style == "copy":
            anim = ReplacementTransform(s.copy(), d, **kwargs) if lib == "ce" else TransformFromCopy(s, d, **kwargs)
        else:
            anim = FadeTransform(s, d, **kwargs)
        anim.begin()
        anim.interpolate(a)
        samples.append({"alpha": a, "pieces": pieces_of(anim.mobject)})
    out["morphs"].append({"name": name, "style": style, "easing": easing, "src": src, "dst": dst, "samples": samples})


morph("t-circle-glyph", "transform", 0, 1, "linear")
morph("t-line-both", "transform", 3, 2)
morph("t-glyph-circle", "transform", 1, 0)
morph("c-both-dot", "copy", 2, 4, "linear")
morph("f-circle-box", "fade", 0, 5)
morph("f-both-line", "fade", 2, 3, "linear")

json.dump(rnd(out), open(f"manim-strokes-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(out["cases"]), "morphs", len(out["morphs"]))
