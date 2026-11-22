"""Relation morphs on real LaTeX glyphs: the glyph outlines of `MathTex` (CE) / `Tex` (GL) of two
formulas, and Manim's ReplacementTransform on chosen glyphs (single glyphs and VGroups) sampled
at a few alphas. The inputs are recorded in each library's own point layout (CE: four points per
cubic; GL: shared-anchor quadratics), so the test feeds the evaluator exactly what Manim started
from — including the way the SVG importer closes and orders subpaths.

Usage: run from a scratch directory (needs LaTeX), with this directory on PYTHONPATH:
    PYTHONPATH=<this dir> manim_ce/venv/bin/python <this dir>/gen_morph_real.py ce  -> manim-morph-real-ce.json
    PYTHONPATH=<this dir> manim_gl/venv/bin/python <this dir>/gen_morph_real.py gl  -> manim-morph-real-gl.json
"""
import json, sys
import numpy as np

lib = sys.argv[1]
ALPHAS = [0.0, 0.3, 0.5, 0.8, 1.0]
if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    def formula(s):
        return MathTex(s)[0]
    def pts(m):
        return np.array(m.points)[:, :2].tolist()
else:
    from manimlib import *  # noqa
    def formula(s):
        return Tex(s)
    def pts(m):
        return np.array(m.get_points())[:, :2].tolist()

A = "mx+y=0"
B = "mx=-y"
SCENARIOS = [
    ("plus-minus", [3 - 1 + 0], [3], "transform"),  # + (index 2) -> −  (index 3)
    ("zero-to-equals", [5], [2], "transform"),      # 0 -> =
    ("y-to-y", [3], [4], "transform"),
    ("mx-to-mx", [0, 1], [0, 1], "transform"),
    ("equals-to-minus-y", [4], [3, 4], "transform"),   # one -> two (split)
    ("plus-y-to-minus", [2, 3], [3], "transform"),     # two -> one (merge)
    ("zero-copy", [5], [2], "copy"),
]
# The first scenario above names glyph 2 (+) — fix the expression to be explicit.
SCENARIOS[0] = ("plus-minus", [2], [3], "transform")

def sample(src_idx, dst_idx, style, alpha, easing_name="smooth"):
    a, b = formula(A), formula(B)
    src = [a[i] for i in src_idx]
    dst = [b[i] for i in dst_idx]
    wrap = len(src) > 1 or len(dst) > 1
    s = VGroup(*src) if wrap else src[0]
    d = VGroup(*dst) if wrap else dst[0]
    kw = {"rate_func": linear}
    if style == "transform":
        anim = ReplacementTransform(s, d, **kw)
    elif lib == "ce":  # D16: copy follows ManimGL (TransformFromCopy = Transform(src.copy(), dst))
        anim = ReplacementTransform(s.copy(), d, **kw)
    else:
        anim = TransformFromCopy(s, d, **kw)
    anim.begin()
    anim.interpolate(alpha)
    members = anim.mobject.family_members_with_points() if lib == "ce" else [x for x in anim.mobject.get_family() if x.has_points()]
    out = []
    for m in members:
        fill = np.array(m.get_fill_rgbas()[0]).tolist() if lib == "ce" else np.array(m.uniforms["fill_rgba"]).tolist()
        out.append({"points": pts(m), "fill": fill})
    return out

a, b = formula(A), formula(B)
out = {"lib": lib, "alphas": ALPHAS, "src": [pts(m) for m in a], "dst": [pts(m) for m in b], "scenarios": []}
for name, si, di, style in SCENARIOS:
    out["scenarios"].append({"name": name, "from": si, "to": di, "style": style,
                             "samples": [{"alpha": al, "pieces": sample(si, di, style, al)} for al in ALPHAS]})
def rnd(x):  # 6 decimals keep the file small; the tests compare to 1e-5
    if isinstance(x, float):
        return round(x, 6)
    if isinstance(x, list):
        return [rnd(v) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v) for k, v in x.items()}
    return x

json.dump(rnd(out), open(f"manim-morph-real-{lib}.json", "w"), separators=(",", ":"))
print(lib, len(a), len(b))
