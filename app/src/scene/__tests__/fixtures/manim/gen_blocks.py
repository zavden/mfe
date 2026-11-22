"""Sample Manim on animation blocks: Appear / Disappear on some glyphs of a formula that is on
screen, run through a real Scene the way `Scene.play` runs them (begin with the scene's own
membership rules, interpolate, then `finish()` and `clean_up_from_scene(scene)`), so that what a
remover leaves behind, and whether a glyph that left can come back, is Manim's own answer.

Usage (from a scratch directory, with this directory on PYTHONPATH; move the JSON one level up):
    PYTHONPATH=<this dir> manim_ce/venv/bin/python <this dir>/gen_blocks.py ce   -> manim-blocks-ce.json
    PYTHONPATH=<this dir> manim_gl/venv/bin/python <this dir>/gen_blocks.py gl   -> manim-blocks-gl.json
    ... gen_blocks.py <lib> check    prints whether each glyph that left is whole again (no JSON)
    ... gen_blocks.py <lib> native   the same with the library's own removers

The removers are the restoring subclasses the exporter emits (DECISIONS D21): after removing the
glyphs, `clean_up_from_scene` puts them back in their start state, so a later Appear brings them
back whole. Every glyph is recorded with whether it is in the scene, its curve anchors and paint.
"""
import json, sys
import numpy as np
from geometry import centred, COLORS

lib = sys.argv[1]  # ce | gl
MODE = sys.argv[2] if len(sys.argv) > 2 else "json"  # json | check | native
NATIVE = MODE == "native"
ALPHAS = [0.0, 0.04, 0.2, 0.33, 0.5, 0.61, 0.8, 0.97, 1.0]
N = 5

if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    from manim.utils import rate_functions as rf
else:
    from manimlib import *  # noqa
    from manimlib.utils import rate_functions as rf
rate = {"linear": rf.linear, "smooth": rf.smooth, "rush_into": rf.rush_into,
        "double_smooth": rf.double_smooth, "slow_into": rf.slow_into,
        "there_and_back": rf.there_and_back, "rush_from": rf.rush_from}


def rnd(x, digits=7):
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x


# --- The formula (as gen_anim.py) -------------------------------------------------------------

def build():
    glyphs = []
    for poly, col in zip(centred(), COLORS):
        pts = [np.array([x, y, 0.0]) for x, y in poly] + [np.array([poly[0][0], poly[0][1], 0.0])]
        g = VMobject()
        g.set_points_as_corners(pts)
        g.set_fill(col, opacity=1.0)
        g.set_stroke(col, width=0, opacity=1.0)
        glyphs.append(g)
    if lib == "ce":
        top = VGroup(VGroup(*glyphs))
    else:
        top = VMobject()
        top.add(*glyphs)
        top.set_color(WHITE, recurse=False)
    return top, glyphs


def record(scene, glyphs):
    shown = set(id(m) for m in scene.get_mobject_family_members())
    rows = []
    for g in glyphs:
        if lib == "ce":
            f = np.array(g.get_fill_rgbas()[0], dtype=float)
            s = np.array(g.get_stroke_rgbas()[0], dtype=float)
            pts = np.array(g.points)
            curves = [[float(pts[i][0]), float(pts[i][1]), float(pts[i + 3][0]), float(pts[i + 3][1])]
                      for i in range(0, len(pts), 4)]
        else:
            f = np.array(g.uniforms["fill_rgba"], dtype=float)
            s = np.array(g.data.rows_or_defaults["stroke_rgba"][0], dtype=float)
            pts = np.array(g.get_points())
            curves = [[float(pts[i][0]), float(pts[i][1]), float(pts[i + 2][0]), float(pts[i + 2][1])]
                      for i in range(0, len(pts) - 2, 2)]
        rows.append({"onScreen": id(g) in shown, "curves": curves, "fill": f.tolist(),
                     "stroke": s.tolist(), "width": float(g.get_stroke_width())})
    return rows


# --- Restoring removers (DECISIONS D21) --------------------------------------------------------

def restoring(cls):
    class Restoring(cls):
        def clean_up_from_scene(self, scene):
            super().clean_up_from_scene(scene)
            self.interpolate(0)
    Restoring.__name__ = "_" + cls.__name__
    return Restoring


if lib == "ce":
    class _UnwriteBase(Write):
        """Unwrite that honours its rate function (what the exporter writes for a non-linear
        easing: `Write(reverse=True, reverse_rate_function=True, remover=True)`)."""
        def __init__(self, vmobject, rate_func=rf.linear, **kwargs):
            super().__init__(vmobject, rate_func=rate_func, reverse=True,
                             reverse_rate_function=True, remover=True, **kwargs)

    class _UnwriteRestoring(_UnwriteBase):
        # Write(reverse=True) inverts the group's submobjects in begin() and inverts them back
        # in finish(), while the starting copy keeps the inverted order: interpolate(0) after
        # finish() would give every glyph the start state of its mirror. Invert around it.
        def clean_up_from_scene(self, scene):
            super().clean_up_from_scene(scene)
            self.reverse_submobjects()
            self.interpolate(0)
            self.reverse_submobjects()
else:
    class _UnwriteBase(Write):
        """The exporter's ManimGL Unwrite (export/codegen/helpers.ts UNWRITE_HELPER)."""
        def __init__(self, vmobject, rate_func=rf.linear, **kwargs):
            glyphs = vmobject.family_members_with_points()
            held = [g for g in glyphs if not any(p in glyphs for p in g.parents)]
            self.holders = [g for g in held if g.submobjects]
            super().__init__(VGroup(*reversed(held)), rate_func=lambda t: rate_func(1 - t), remover=True, **kwargs)

        def begin(self):
            for holder in self.holders:
                holder.reverse_submobjects()
            super().begin()

        def finish(self):
            super().finish()
            for holder in self.holders:
                holder.reverse_submobjects()

        def interpolate_submobject(self, submob, start, outline, alpha):
            super().interpolate_submobject(submob, start, outline, alpha)
            if alpha < 0.5:
                submob.match_style(outline)

    _UnwriteRestoring = restoring(_UnwriteBase)

if NATIVE:
    FADE_OUT, UNCREATE, SHRINK, UNWRITE = FadeOut, Uncreate, ShrinkToCenter, _UnwriteBase
else:
    # CE's FadeOut restores itself in clean_up_from_scene. ManimGL's (1.7.2) does too, in
    # finish() (final_alpha_value=0), so its `_FadeOut` changes nothing; it is sampled as the
    # exporter writes it. Uncreate, ShrinkToCenter and Unwrite leave degenerate glyphs in both.
    FADE_OUT = FadeOut if lib == "ce" else restoring(FadeOut)
    UNCREATE, SHRINK, UNWRITE = restoring(Uncreate), restoring(ShrinkToCenter), _UnwriteRestoring


def make(spec, glyphs):
    group = VGroup(*[glyphs[i] for i in spec["glyphs"]])
    e = rate[spec["easing"]]
    lag = {} if spec["lag"] is None else {"lag_ratio": spec["lag"]}
    shift = np.array([*spec.get("shift", [0.0, 0.0]), 0.0])
    scale = spec.get("scale", 1.0)
    a = spec["anim"]
    if a == "write":
        # ManimGL's Write traces outlines in `group.get_color()` (the first glyph's fill for a
        # fresh VGroup); the exporter passes the formula colour, as for an intro.
        extra = {"stroke_color": WHITE} if lib == "gl" else {}
        return Write(group, rate_func=e, **lag, **extra)
    if a == "draw_border_then_fill":
        return DrawBorderThenFill(group, rate_func=e, **lag)
    if a == "create":
        return (Create if lib == "ce" else ShowCreation)(group, rate_func=e, **lag)
    if a == "fade_in":
        return FadeIn(group, shift=shift, scale=scale, rate_func=e, **lag)
    if a == "grow_from_center":
        return GrowFromCenter(group, rate_func=e, **lag)
    if a == "fade_out":
        return FADE_OUT(group, shift=shift, scale=scale, rate_func=e, **lag)
    if a == "shrink_to_center":
        return SHRINK(group, rate_func=e, remover=True, **lag)
    if a == "uncreate":
        if lib == "ce":
            return UNCREATE(group, rate_func=e, **lag)
        return UNCREATE(group, rate_func=(lambda t: e(1 - t)), **lag)
    if a == "unwrite":
        extra = {"stroke_color": WHITE} if lib == "gl" else {}  # as the exporter's _Unwrite
        return UNWRITE(group, rate_func=e, **lag, **extra)
    raise ValueError(a)


def new_scene():
    return Scene()


def run_case(case):
    scene = new_scene()
    top, glyphs = build()
    scene.add(*[glyphs[i] for i in case["initial"]])
    out = {"before": record(scene, glyphs), "plays": []}
    for play in case["plays"]:
        anims = [make(spec, glyphs) for spec in play]
        if lib == "ce":
            scene.compile_animation_data(*anims)
            scene.begin_animations()
        else:
            scene.begin_animations(anims)
        samples = []
        for a in ALPHAS:
            for anim in anims:
                anim.interpolate(a)
            samples.append({"alpha": a, "glyphs": record(scene, glyphs)})
        for anim in anims:
            anim.finish()
            anim.clean_up_from_scene(scene)
        out["plays"].append({"actions": play, "samples": samples, "after": record(scene, glyphs)})
    return out


def act(kind, anim, glyphs, easing, lag=None, **params):
    return {"kind": kind, "anim": anim, "glyphs": glyphs, "easing": easing, "lag": lag, **params}


SHIFT_IN, SHIFT_OUT = [0.5, -1.0], [-0.4, 0.7]
CASES = [
    # 1. A subgroup brought in while the other glyphs are on screen.
    {"name": "write-subgroup", "initial": [0, 1, 4],
     "plays": [[act("appear", "write", [2, 3], "linear")]]},
    {"name": "write-subgroup-smooth-lag", "initial": [0, 4],
     "plays": [[act("appear", "write", [1, 2, 3], "smooth", 0.3)]]},
    {"name": "create-subgroup", "initial": [0, 2, 4],
     "plays": [[act("appear", "create", [1, 3], "smooth")]]},
    {"name": "fade_in-subgroup", "initial": [0, 1, 2],
     "plays": [[act("appear", "fade_in", [3, 4], "smooth", None, shift=SHIFT_IN, scale=1.5)]]},
    {"name": "grow-and-dbtf", "initial": [0],
     "plays": [[act("appear", "grow_from_center", [1, 2], "smooth", 0.2),
                act("appear", "draw_border_then_fill", [3, 4], "double_smooth")]]},
    # 2. Out and back in.
    {"name": "fade_out-then-fade_in", "initial": [0, 1, 2, 3, 4],
     "plays": [[act("disappear", "fade_out", [1, 2], "smooth", None, shift=SHIFT_OUT, scale=0.5)],
               [act("appear", "fade_in", [1, 2], "smooth")]]},
    {"name": "uncreate-then-create", "initial": [0, 1, 2, 3, 4],
     "plays": [[act("disappear", "uncreate", [0, 3], "smooth")],
               [act("appear", "create", [0, 3], "linear", 0.4)]]},
    {"name": "unwrite-then-write", "initial": [0, 1, 2, 3, 4],
     "plays": [[act("disappear", "unwrite", [1, 2, 3], "linear")],
               [act("appear", "write", [1, 2, 3], "linear")]]},
    {"name": "unwrite-smooth-then-grow", "initial": [0, 1, 2, 3, 4],
     "plays": [[act("disappear", "unwrite", [0, 2, 4], "smooth", 0.3)],
               [act("appear", "grow_from_center", [0, 2, 4], "smooth")]]},
    {"name": "shrink-then-fade_in", "initial": [0, 1, 2, 3, 4],
     "plays": [[act("disappear", "shrink_to_center", [2], "smooth", 0.3)],
               [act("appear", "fade_in", [2], "rush_into", None, shift=SHIFT_IN, scale=2.0)]]},
    # 3. One play: some glyphs come in while others leave.
    {"name": "mixed", "initial": [0, 1, 2],
     "plays": [[act("appear", "fade_in", [3, 4], "smooth", None, shift=SHIFT_IN, scale=1.5),
                act("disappear", "uncreate", [0, 1], "smooth")],
               [act("appear", "write", [0, 1], "linear"),
                act("disappear", "shrink_to_center", [2], "smooth")]]},
]

if MODE != "json":
    # What the removers leave: is a glyph that left whole again (in its start state)?
    for case in CASES:
        res = run_case(case)
        for k, play in enumerate(res["plays"]):
            for spec in play["actions"]:
                if spec["kind"] != "disappear":
                    continue
                for g in spec["glyphs"]:
                    row = play["after"][g]
                    base = centred()[g]
                    pts = row["curves"]
                    start = [c[:2] for c in pts]
                    want = [list(p) for p in base]
                    ok = len(start) == len(want) and all(
                        abs(a[0] - b[0]) + abs(a[1] - b[1]) < 1e-6 for a, b in zip(start, want))
                    print(f"{lib} {case['name']} play {k} {spec['anim']} glyph {g}: "
                          f"onScreen={row['onScreen']} whole={ok} fill={rnd(row['fill'], 3)} "
                          f"width={rnd(row['width'], 3)}")
    sys.exit(0)

out = {"lib": lib, "polygons": centred(), "colors": COLORS, "cases": []}
for case in CASES:
    try:
        res = run_case(case)
    except Exception as ex:
        raise RuntimeError(f"{case['name']}: {ex!r}")
    out["cases"].append({"name": case["name"], "initial": case["initial"], **res})
json.dump(rnd(out), open(f"manim-blocks-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(out["cases"]))
