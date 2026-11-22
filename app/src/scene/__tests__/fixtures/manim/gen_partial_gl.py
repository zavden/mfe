"""ManimGL pointwise_become_partial fixtures: quadratic paths mixing lines (one quadratic each)
and cubics (two each, `get_quadratic_approximation_of_cubic`), with several subpaths. Each sample
keeps the path's points and the portion [a, b] Manim cuts, from the curve holding a to the one
holding b (the points Manim collapses onto the ends before and after it draw nothing and are left
out). Run from `fixtures/` with the manim_gl venv: python manim/gen_partial_gl.py, then
`npx prettier --write` the JSON (the fixtures are kept in Prettier's layout)."""
import json
import numpy as np
from manimlib import *
from manimlib.utils.bezier import integer_interpolate


def rnd(x, digits=7):
    """Round every float in a JSON-like structure (keeps the fixtures small and diff-friendly)."""
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x

rng = np.random.default_rng(11)

def make_path(counts):
    """Closed subpaths of `counts` segments each, every segment a line or a cubic at random."""
    vm = VMobject()
    for k in counts:
        p0 = rng.uniform(-2, 2, 2)
        cur = p0
        vm.start_new_path(np.array([*p0, 0.0]))
        for i in range(k):
            end = cur + rng.uniform(-1, 1, 2) if i < k - 1 else p0
            if rng.uniform() < 0.5:
                vm.add_line_to(np.array([*end, 0.0]))
            else:
                h1 = cur + rng.uniform(-1, 1, 2)
                h2 = end + rng.uniform(-1, 1, 2)
                vm.add_cubic_bezier_curve_to(np.array([*h1, 0.0]), np.array([*h2, 0.0]), np.array([*end, 0.0]))
            cur = end
    return vm

cases = []
pairs = [(0.0, float(x)) for x in np.linspace(0.02, 0.98, 25)] + [(0.2, 0.7), (0.35, 0.36), (0.5, 0.5), (0.9, 1.0), (0.0, 1.0)]
for counts in ([5], [4, 3], [7, 2, 5]):
    vm = make_path(counts)
    pts = vm.get_points()
    n = vm.get_num_curves()
    for a, b in pairs:
        part = vm.copy()
        part.pointwise_become_partial(vm, a, b)
        lower, _ = integer_interpolate(0, n, a)
        upper, _ = integer_interpolate(0, n, b)
        i1, i4 = 2 * lower, 2 * upper + 3
        cases.append({
            "points": [[float(v) for v in p[:2]] for p in pts],
            "curves": int(n),
            "a": a, "b": b,
            "portion": [[float(v) for v in p[:2]] for p in part.get_points()[i1:i4]],
        })
json.dump(rnd({"partial": cases}, 9), open("manim-partial-gl.json", "w"), separators=(",", ":"))
print("partial", len(cases), "curves per path", [c["curves"] for c in cases[::len(pairs)]])
