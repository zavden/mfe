"""CE pointwise_become_partial and colour interpolation fixtures."""
import json
import numpy as np
from manim import *
from manim import config


def rnd(x, digits=7):
    """Round every float in a JSON-like structure (keeps the fixtures small and diff-friendly)."""
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x
config.verbosity = "ERROR"

rng = np.random.default_rng(7)

def make_path(contours):
    vm = VMobject()
    for ci, curves in enumerate(contours):
        start = np.array(curves[0][0] + [0.0])
        vm.start_new_path(start)
        for (_, h1, h2, p3) in curves:
            vm.add_cubic_bezier_curve_to(np.array(h1 + [0.0]), np.array(h2 + [0.0]), np.array(p3 + [0.0]))
    return vm

def random_contours(counts):
    contours = []
    for k in counts:
        p0 = rng.uniform(-2, 2, 2)
        curves = []
        cur = p0
        for i in range(k):
            h1 = cur + rng.uniform(-1, 1, 2)
            h2 = cur + rng.uniform(-1, 1, 2)
            p3 = cur + rng.uniform(-1, 1, 2) if i < k - 1 else p0
            curves.append((cur.tolist(), h1.tolist(), h2.tolist(), p3.tolist()))
            cur = p3
        contours.append(curves)
    return contours

cases = []
for counts in ([5], [4, 3], [7, 2, 5]):
    contours = random_contours(counts)
    vm = make_path(contours)
    for a, b in [(0, 0.3), (0, 0.5), (0, 1), (0.2, 0.7), (0.35, 0.36), (0.5, 0.5), (0.9, 1.0), (0, 0.0), (0, 0.999)]:
        part = VMobject()
        part.pointwise_become_partial(vm, a, b)
        pts = np.array(part.points)
        cases.append({
            "contours": [[[*c[0], *c[1], *c[2], *c[3]] for c in cs] for cs in contours],
            "a": a, "b": b,
            "curves": [[float(v) for p in pts[i:i + 4] for v in p[:2]] for i in range(0, len(pts), 4)],
        })

# Colour interpolation as Manim does in Transform (rgba arrays, linear).
col = []
for c1, c2 in [("#FC6255", "#58C4DD"), ("#000000", "#FFFFFF"), ("#83C167", "#FFFF00")]:
    for a in (0.0, 0.25, 0.5, 0.9, 1.0):
        m1 = VMobject().set_fill(c1, 0.8).set_stroke(c1, 1, 0.8)
        m2 = VMobject().set_fill(c2, 1.0).set_stroke(c2, 1, 1.0)
        out = VMobject().set_fill(WHITE, 1)
        out.interpolate(m1, m2, a)
        col.append({"from": c1, "to": c2, "alpha": a, "ce": np.array(out.get_fill_rgbas()[0]).tolist()})
json.dump(rnd({"partial": cases, "colors": col}), open("manim-partial-ce.json", "w"), separators=(",", ":"))
print("partial", len(cases), "colors", len(col))

