"""Sample Manim's own relation morphs (Transform family) on small hand-made glyph shapes.

Each scenario builds the glyphs of a source and a target "formula" (lists of shapes), runs the real
animation the contract in docs/ARCHITECTURE.md §5 names (`ReplacementTransform`, `TransformFromCopy` in GL
and `ReplacementTransform(src.copy(), dst)` in CE, `FadeTransform`, with `VGroup` on both sides when either has more than one glyph), calls `begin()` and
`interpolate(alpha)` and records every family member with points: all its points, fill and stroke.

Usage: run from a scratch directory (Manim writes `media/` into the cwd) with this directory on
PYTHONPATH, then move the JSON next to the tests (one directory up):
    PYTHONPATH=<this dir> manim_ce/venv/bin/python <this dir>/gen_morph.py ce   -> manim-morph-ce.json
    PYTHONPATH=<this dir> manim_gl/venv/bin/python <this dir>/gen_morph.py gl   -> manim-morph-gl.json
"""
import json, sys
import numpy as np

lib = sys.argv[1]  # ce | gl
ALPHAS = [0.0, 0.15, 0.4, 0.5, 0.75, 1.0]

if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    from manim.utils import rate_functions as rf
else:
    from manimlib import *  # noqa
    from manimlib.utils import rate_functions as rf

RATE = {"linear": rf.linear, "smooth": rf.smooth, "rush_into": rf.rush_into, "rush_from": rf.rush_from,
        "double_smooth": rf.double_smooth, "slow_into": rf.slow_into, "there_and_back": rf.there_and_back}


def rnd(x, digits=7):
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x


K = 0.5522847498  # circle by four cubic arcs

# A shape is a list of subpaths; a subpath is [start, segment, ...] with segments
# ["L", end] or ["C", c1, c2, end]. No side lengths tie, so GL's choice of the curve to cut is unambiguous.
SHAPES = {
    "tri": [[[0.0, 0.0], ["L", [1.2, 0.1]], ["L", [0.5, 0.9]], ["L", [0.0, 0.0]]]],
    "quad": [[[0.0, 0.0], ["L", [0.7, 0.05]], ["L", [0.62, 0.95]], ["L", [-0.05, 0.88]], ["L", [0.0, 0.0]]]],
    "hex": [[[0.0, 0.0], ["L", [0.5, -0.2]], ["L", [0.95, 0.15]], ["L", [0.85, 0.7]], ["L", [0.4, 0.95]],
             ["L", [-0.1, 0.6]], ["L", [0.0, 0.0]]]],
    "blob": [[[0.0, 0.0], ["C", [0.4, -0.2], [0.8, 0.0], [0.9, 0.4]], ["C", [1.0, 0.8], [0.6, 1.1], [0.3, 0.95]],
              ["C", [0.0, 0.85], [-0.2, 0.7], [-0.15, 0.45]], ["C", [-0.1, 0.2], [-0.05, 0.1], [0.0, 0.0]]]],
    "disc": [[[0.5, 0.0], ["C", [0.5, K * 0.5], [K * 0.5, 0.5], [0.0, 0.5]],
              ["C", [-K * 0.5, 0.5], [-0.5, K * 0.5], [-0.5, 0.0]],
              ["C", [-0.5, -K * 0.5], [-K * 0.5, -0.5], [0.0, -0.5]],
              ["C", [K * 0.5, -0.5], [0.5, -K * 0.5], [0.5, 0.0]]]],
    "ring": [
        [[0.0, 0.0], ["L", [0.9, 0.05]], ["L", [0.85, 1.0]], ["L", [-0.05, 0.9]], ["L", [0.0, 0.0]]],
        [[0.2, 0.25], ["L", [0.22, 0.7]], ["L", [0.6, 0.72]], ["L", [0.62, 0.3]], ["L", [0.2, 0.25]]],
    ],
    "trip": [
        [[0.0, 0.0], ["L", [0.4, 0.05]], ["L", [0.15, 0.45]], ["L", [0.0, 0.0]]],
        [[0.6, 0.1], ["L", [1.1, 0.15]], ["L", [0.8, 0.6]], ["L", [0.6, 0.1]]],
        [[0.3, 0.7], ["L", [0.8, 0.85]], ["L", [0.45, 1.1]], ["L", [0.3, 0.7]]],
    ],
}


def build(shape_name, shift, color, opacity):
    m = VMobject()
    for sp in SHAPES[shape_name]:
        start = sp[0]
        m.start_new_path(np.array([start[0], start[1], 0.0]))
        for seg in sp[1:]:
            if seg[0] == "L":
                m.add_line_to(np.array([seg[1][0], seg[1][1], 0.0]))
            else:
                m.add_cubic_bezier_curve_to(*[np.array([p[0], p[1], 0.0]) for p in seg[1:]])
    m.shift(np.array([shift[0], shift[1], 0.0]))
    m.set_fill(color, opacity=opacity)
    m.set_stroke(color, width=0, opacity=opacity)
    return m


def group(mobs, wrap):
    """A bare glyph when both sides are single glyphs, else a VGroup on both sides (ARCHITECTURE §5)."""
    return VGroup(*mobs) if wrap else mobs[0]


def rgba(m):
    if lib == "ce":
        return (np.array(m.get_fill_rgbas()[0], dtype=float).tolist(),
                np.array(m.get_stroke_rgbas()[0], dtype=float).tolist(), float(m.get_stroke_width()))
    return (np.array(m.uniforms["fill_rgba"], dtype=float).tolist() if "fill_rgba" in m.uniforms
            else np.array(m.data["fill_rgba"][0], dtype=float).tolist(),
            np.array(m.data["stroke_rgba"][0], dtype=float).tolist(), float(m.get_stroke_width()))


def points_of(m):
    pts = np.array(m.points if lib == "ce" else m.get_points())
    return pts[:, :2].tolist()


def pieces_of(top):
    members = top.family_members_with_points() if lib == "ce" else [x for x in top.get_family() if x.has_points()]
    out = []
    for m in members:
        f, s, w = rgba(m)
        out.append({"points": points_of(m), "fill": f, "stroke": s, "width": w})
    return out


def make_anim(style, src, dst, easing, arc):
    kw = {"rate_func": RATE[easing], "path_arc": arc}
    wrap = len(src) > 1 or len(dst) > 1
    s, d = group(src, wrap), group(dst, wrap)
    if style == "transform":
        return ReplacementTransform(s, d, **kw), None
    if style == "copy":
        # D16: `copy` follows ManimGL in both targets; GL's TransformFromCopy is
        # Transform(src.copy(), dst), which CE exports as ReplacementTransform(src.copy(), dst).
        if lib == "ce":
            return ReplacementTransform(s.copy(), d, **kw), None
        return TransformFromCopy(s, d, **kw), None
    return FadeTransform(s, d, **kw), None


def sample(sc, alpha):
    src = [build(g["shape"], g["shift"], g["color"], g["opacity"]) for g in sc["src"]]
    dst = [build(g["shape"], g["shift"], g["color"], g["opacity"]) for g in sc["dst"]]
    anim, _ = make_anim(sc["style"], src, dst, sc["easing"], sc["pathArc"])
    anim.begin()
    anim.interpolate(alpha)
    return pieces_of(anim.mobject)


def g(shape, x, y, color, opacity=1.0):
    return {"shape": shape, "shift": [x, y], "color": color, "opacity": opacity}


RED, BLUE, GREEN, YEL, ORG = "#FC6255", "#58C4DD", "#83C167", "#FFFF00", "#FF862F"
SCENARIOS = []


def scenario(name, style, src, dst, easing="smooth", arc=0.0):
    SCENARIOS.append({"name": name, "style": style, "src": src, "dst": dst, "easing": easing, "pathArc": arc})


# One to one, different curve counts / subpaths.
scenario("t-tri-quad", "transform", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE, 0.8)], "linear")
scenario("t-blob-disc", "transform", [g("blob", -3, 0.5, RED)], [g("disc", 2, -1, GREEN)])
scenario("t-ring-tri", "transform", [g("ring", -3, 0, YEL)], [g("tri", 2, 0.5, BLUE)])
scenario("t-tri-trip", "transform", [g("tri", -3, 0, YEL)], [g("trip", 2, 0.5, BLUE)], "linear")
scenario("t-disc-ring", "transform", [g("disc", -3, 0, ORG)], [g("ring", 2, 0, GREEN)])
scenario("t-hex-blob-rush", "transform", [g("hex", -3, 0, RED)], [g("blob", 2, 0, BLUE)], "rush_into")
# Splits and merges.
scenario("t-1-2", "transform", [g("blob", -3, 0, RED)], [g("tri", 1, 1, BLUE), g("disc", 3, -1, GREEN)])
scenario("t-2-1", "transform", [g("tri", -3, 1, RED), g("hex", -1, -1, YEL)], [g("disc", 2, 0, BLUE)])
scenario("t-1-3", "transform", [g("quad", -3, 0, RED)], [g("tri", 0, 1, BLUE), g("hex", 1.5, 0, GREEN), g("blob", 3, 1, YEL)], "linear")
scenario("t-3-2", "transform", [g("tri", -4, 0, RED), g("hex", -2, 1, YEL), g("quad", -1, -1, GREEN)],
         [g("disc", 1, 0, BLUE), g("blob", 3, 0, ORG)])
scenario("t-2-2", "transform", [g("tri", -3, 0, RED), g("quad", -1, 0, GREEN)], [g("disc", 1, 0, BLUE), g("ring", 3, 0, YEL)])
# Path arcs.
scenario("t-arc", "transform", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE)], "smooth", float(np.deg2rad(70)))
scenario("t-arc-neg-2-1", "transform", [g("tri", -3, 1, RED), g("hex", -1, -1, YEL)], [g("disc", 2, 0, BLUE)],
         "linear", float(np.deg2rad(-110)))
# Copies.
scenario("c-tri-quad", "copy", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE, 0.8)], "linear")
scenario("c-arc", "copy", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE)], "linear", float(np.deg2rad(70)))
scenario("c-rush", "copy", [g("blob", -3, 0, RED)], [g("disc", 2, 0, BLUE)], "rush_into")
scenario("c-1-2", "copy", [g("blob", -3, 0, RED)], [g("tri", 1, 1, BLUE), g("hex", 3, -1, GREEN)], "linear")
scenario("c-2-1", "copy", [g("tri", -3, 1, RED), g("hex", -1, -1, YEL)], [g("disc", 2, 0, BLUE)], "linear")
# Fades.
scenario("f-tri-quad", "fade", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE, 0.8)], "linear")
scenario("f-arc", "fade", [g("tri", -3, 0, RED)], [g("quad", 2, 1, BLUE)], "smooth", float(np.deg2rad(60)))
scenario("f-2-1", "fade", [g("tri", -3, 1, RED), g("hex", -1, -1, YEL)], [g("disc", 2, 0, BLUE)], "linear")
scenario("f-1-2", "fade", [g("blob", -3, 0, RED)], [g("tri", 1, 1, BLUE), g("hex", 3, -1, GREEN)], "linear")

out = {"lib": lib, "alphas": ALPHAS, "shapes": SHAPES, "scenarios": []}
for sc in SCENARIOS:
    samples = []
    for a in ALPHAS:
        try:
            samples.append({"alpha": a, "pieces": sample(sc, a)})
        except Exception as ex:  # surface failures loudly
            raise RuntimeError(f"{sc['name']} @ {a}: {ex!r}")
    out["scenarios"].append({**sc, "samples": samples})
json.dump(rnd(out), open(f"manim-morph-{lib}.json", "w"), separators=(",", ":"))
print(lib, "scenarios", len(SCENARIOS))
