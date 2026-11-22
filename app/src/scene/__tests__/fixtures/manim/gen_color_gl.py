import json
import numpy as np
from manimlib import *


def rnd(x, digits=7):
    """Round every float in a JSON-like structure (keeps the fixtures small and diff-friendly)."""
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x
out = []
for c1, c2 in [("#FC6255", "#58C4DD"), ("#000000", "#FFFFFF"), ("#83C167", "#FFFF00")]:
    for a in (0.0, 0.25, 0.5, 0.9, 1.0):
        m1 = VMobject(); m1.set_fill(c1, 0.8); m1.set_stroke(c1, 1, 0.8)
        m2 = VMobject(); m2.set_fill(c2, 1.0); m2.set_stroke(c2, 1, 1.0)
        for m in (m1, m2):
            m.set_points_as_corners([np.zeros(3), np.array([1.,0,0]), np.array([1.,1,0]), np.zeros(3)])
        o = m1.copy()
        o.interpolate(m1, m2, a)
        sq = interpolate_color(c1, c2, a)
        out.append({"from": c1, "to": c2, "alpha": a, "gl": np.array(o.uniforms["fill_rgba"]).tolist(), "gl_interpolate_color": str(sq)})
json.dump(rnd(out), open("manim-color-gl.json", "w"), separators=(",", ":"))
print(len(out))

