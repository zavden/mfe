"""Sample Manim on the Emphasis blocks (D73): Indicate, Wiggle, Circumscribe, Flash and FocusOn on
some glyphs of the five-glyph polygon "formula" (as gen_anim.py), run through a real Scene the way
`Scene.play` runs them (begin with the scene's own membership rules, the reference updaters,
interpolate, then `finish()` and `clean_up_from_scene(scene)`). Indicate and Wiggle move the glyphs
themselves; the other three draw a temporary mobject — the frame of the Circumscribe, the twelve
lines of the Flash, the disc of the FocusOn — which is recorded with whether it is in the scene.

Wiggle and Circumscribe are the helpers the exporter writes (export/codegen/helpers.ts): `_Wiggle`
keeps a copy of the pivot it reads when it begins (Manim's Wiggle reads the centre again while it
moves the glyphs one by one, so the pivot drifts; ManimGL's WiggleOutThenIn refuses an array pivot,
and its `get_center()` is a view into the bounding box that scaling rewrites, so a bare reference
drifts too) and
`_Circumscribe` is ManimCE's Circumscribe — a `ShowPassingFlash` over a `SurroundingRectangle` —
for both libraries, on the layer it is given. Flash and FocusOn are each library's own, given the
point (the centre of the glyphs when the block starts, as the exporter writes it).

Usage (from a scratch directory, with this directory on PYTHONPATH; move the JSON one level up):
    PYTHONPATH=<this dir> manim_ce/venv/bin/python <this dir>/gen_emphasis.py ce  -> manim-emphasis-ce.json
    PYTHONPATH=<this dir> manim_gl/venv/bin/python <this dir>/gen_emphasis.py gl  -> manim-emphasis-gl.json
    ... gen_emphasis.py <lib> check   prints how far the helpers are from the library's own classes
"""
import json, sys
import numpy as np
from geometry import centred, COLORS

lib = sys.argv[1]  # ce | gl
MODE = sys.argv[2] if len(sys.argv) > 2 else "json"  # json | check
ALPHAS = [0.0, 0.04, 0.2, 0.33, 0.5, 0.61, 0.8, 0.97, 1.0]

if lib == "ce":
    from manim import *  # noqa
    from manim import config
    config.verbosity = "ERROR"
    from manim.utils import rate_functions as rf
    FOCUS_RADIUS = float(config["frame_x_radius"] + config["frame_y_radius"])
else:
    from manimlib import *  # noqa
    from manimlib.utils import rate_functions as rf
    FOCUS_RADIUS = float(FRAME_X_RADIUS + FRAME_Y_RADIUS)
rate = {"linear": rf.linear, "smooth": rf.smooth, "there_and_back": rf.there_and_back,
        "there_and_back_with_pause": rf.there_and_back_with_pause, "rush_into": rf.rush_into}


# --- The helpers as the exporter writes them (export/codegen/helpers.ts) -----------------------

class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)


class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer `z_index` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)


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


def pts(m):
    points = np.array(m.points if lib == "ce" else m.get_points())
    return points[:, :2].tolist()


def style(m):
    if lib == "ce":
        return {"fill": [float(v) for v in m.get_fill_rgbas()[0]],
                "stroke": [float(v) for v in m.get_stroke_rgbas()[0]],
                "width": float(m.get_stroke_width())}
    return {"fill": [float(v) for v in m.uniforms["fill_rgba"]],
            "stroke": [float(v) for v in m.data.rows_or_defaults["stroke_rgba"][0]],
            "width": float(m.get_stroke_width())}


def shown_ids(scene):
    return set(id(m) for m in scene.get_mobject_family_members())


def record_glyphs(scene, glyphs):
    shown = shown_ids(scene)
    return [{"onScreen": id(g) in shown, "points": pts(g), **style(g)} for g in glyphs]


def record_temp(scene, mobs):
    """Every family member with points of the temporary mobjects, as the renderer draws them."""
    shown = shown_ids(scene)
    out = []
    for top in mobs:
        family = top.family_members_with_points() if lib == "ce" else [
            m for m in top.get_family() if m.has_points()]
        for m in family:
            out.append({"cls": type(m).__name__, "onScreen": id(m) in shown, "points": pts(m),
                        **style(m)})
    return out


def rnd(x, digits=7):
    if isinstance(x, float):
        return round(x, digits)
    if isinstance(x, (list, tuple)):
        return [rnd(v, digits) for v in x]
    if isinstance(x, dict):
        return {k: rnd(v, digits) for k, v in x.items()}
    return x


def v2(p):
    return [float(p[0]), float(p[1])]


# --- Cases ------------------------------------------------------------------------------------

TRANSFORMS = {"as-is": lambda m: m, "scaled-rotated": lambda m: m.scale(1.3).rotate(20 * DEGREES)}

CASES = [
    {"name": "indicate-default", "effect": "indicate", "glyphs": [1, 2], "params": {}},
    {"name": "indicate-custom", "effect": "indicate", "glyphs": [0, 3, 4],
     "params": {"scale_factor": 1.5, "color": "#FC6255", "rate_func": "there_and_back_with_pause"}},
    {"name": "indicate-turned", "effect": "indicate", "glyphs": [2, 3], "transform": "scaled-rotated",
     "params": {}},
    {"name": "wiggle-default", "effect": "wiggle", "glyphs": [0, 3], "params": {}},
    {"name": "wiggle-custom", "effect": "wiggle", "glyphs": [2],
     "params": {"scale_value": 1.3, "rotation_angle": 10 * DEGREES, "n_wiggles": 3,
                "rate_func": "linear"}},
    {"name": "wiggle-turned", "effect": "wiggle", "glyphs": [1, 4], "transform": "scaled-rotated",
     "params": {}},
    {"name": "circumscribe-default", "effect": "circumscribe", "glyphs": [1, 2], "params": {}},
    {"name": "circumscribe-custom", "effect": "circumscribe", "glyphs": [0, 1, 2, 3, 4],
     "params": {"buff": 0.3, "stroke_width": 2, "time_width": 1, "color": "#58C4DD",
                "rate_func": "linear", "z_index": 3}},
    {"name": "circumscribe-turned", "effect": "circumscribe", "glyphs": [3],
     "transform": "scaled-rotated", "params": {"rate_func": "rush_into"}},
    {"name": "flash-default", "effect": "flash", "glyphs": [1, 2], "params": {}},
    {"name": "flash-red", "effect": "flash", "glyphs": [4], "params": {"color": "#FC6255"}},
    {"name": "focus-default", "effect": "focus_on", "glyphs": [1, 2], "params": {}},
    {"name": "focus-custom", "effect": "focus_on", "glyphs": [3],
     "params": {"color": "#FC6255", "opacity": 0.5, "rate_func": "linear"}},
]


def make(case, glyphs):
    group = VGroup(*[glyphs[i] for i in case["glyphs"]])
    params = dict(case["params"])
    name = params.pop("rate_func", None)
    kw = {"rate_func": rate[name]} if name else {}
    effect = case["effect"]
    if effect == "indicate":
        return Indicate(group, **params, **kw), []
    if effect == "wiggle":
        return _Wiggle(group, **params, **kw), []
    if effect == "circumscribe":
        anim = _Circumscribe(group, **params, **kw)
        return anim, [anim.mobject]
    if effect == "flash":
        # Flash takes no rate function here: ManimGL would hand it to the group, not the lines.
        anim = Flash(group.get_center(), **params)
        return anim, [anim.lines]
    if effect == "focus_on":
        anim = FocusOn(group.get_center(), **params, **kw)
        return anim, [anim.mobject]
    raise ValueError(effect)


def update_references(anim, dt=0.0):
    # What the scene loop does before every interpolate: the reference mobjects' updaters (a
    # FocusOn's target rides an updater to the point).
    if lib == "ce":
        anim.update_mobjects(dt)
    else:
        anim.update_reference_mobjects(dt)


def run_case(case):
    scene = Scene()
    top, glyphs = build()
    TRANSFORMS[case.get("transform", "as-is")](top)
    scene.add(*glyphs)
    group = VGroup(*[glyphs[i] for i in case["glyphs"]])
    out = {"center": v2(group.get_center()), "before": record_glyphs(scene, glyphs)}
    anim, temps = make(case, glyphs)
    if lib == "ce":
        scene.compile_animation_data(anim)
        scene.begin_animations()
    else:
        scene.begin_animations([anim])
    samples = []
    for a in ALPHAS:
        update_references(anim)
        anim.interpolate(a)
        # Then the scene's own updaters (ManimGL's Flash keeps its lines on the point with one).
        scene.update_mobjects(0.0)
        samples.append({"alpha": a, "glyphs": record_glyphs(scene, glyphs),
                        "temp": record_temp(scene, temps)})
    anim.finish()
    anim.clean_up_from_scene(scene)
    out["samples"] = samples
    out["after"] = {"glyphs": record_glyphs(scene, glyphs), "temp": record_temp(scene, temps)}
    return out


if MODE == "check":
    # How far the helpers are from the library's own classes, on the default case of each.
    def sample(anim, scene, mob, alphas=ALPHAS):
        if lib == "ce":
            scene.compile_animation_data(anim)
            scene.begin_animations()
        else:
            scene.begin_animations([anim])
        out = []
        for a in alphas:
            update_references(anim)
            anim.interpolate(a)
            out.append(np.array(sum((pts(m) for m in mob()), [])))
        anim.finish()
        anim.clean_up_from_scene(scene)
        return out

    def worst(a, b):
        return max(float(np.abs(x - y).max()) for x, y in zip(a, b))

    # Wiggle: the helper against the library's own class on the same glyphs.
    for name in ("wiggle", "wiggle-native"):
        scene = Scene()
        top, glyphs = build()
        scene.add(*glyphs)
        group = VGroup(glyphs[0], glyphs[3])
        if name == "wiggle":
            runs = sample(_Wiggle(group), scene, lambda: list(group))
        else:
            try:
                native = Wiggle(group) if lib == "ce" else WiggleOutThenIn(group)
                runs = sample(native, scene, lambda: list(group))
            except Exception as ex:  # noqa
                print(f"{lib} {name}: {type(ex).__name__}: {ex}")
                continue
        globals()[name] = runs
    if "wiggle" in globals() and "wiggle-native" in globals():
        print(f"{lib} wiggle helper vs native: worst point difference "
              f"{worst(globals()['wiggle'], globals()['wiggle-native']):.6f}")
    if lib == "gl":
        scene = Scene()
        top, glyphs = build()
        scene.add(*glyphs)
        group = VGroup(glyphs[0], glyphs[3])
        try:
            sample(WiggleOutThenIn(group, scale_about_point=group.get_center()), scene,
                   lambda: list(group))
            print(f"{lib} WiggleOutThenIn with an array pivot: fine")
        except Exception as ex:  # noqa
            print(f"{lib} WiggleOutThenIn with an array pivot: {type(ex).__name__}: {ex}")
    if lib == "ce":
        # Circumscribe: the helper's frame against the frame inside ManimCE's Succession.
        scene = Scene()
        top, glyphs = build()
        scene.add(*glyphs)
        group = VGroup(glyphs[1], glyphs[2])
        helper = _Circumscribe(group)
        ours = sample(helper, scene, lambda: [helper.mobject])
        scene = Scene()
        top, glyphs = build()
        scene.add(*glyphs)
        group = VGroup(glyphs[1], glyphs[2])
        native = Circumscribe(group)
        theirs = sample(native, scene, lambda: [native.animations[0].mobject])
        print(f"{lib} circumscribe helper vs native: worst point difference {worst(ours, theirs):.6f}")
    sys.exit(0)

out = {"lib": lib, "polygons": centred(), "colors": COLORS, "focusRadius": FOCUS_RADIUS,
       "cases": []}
for case in CASES:
    try:
        res = run_case(case)
    except Exception as ex:
        raise RuntimeError(f"{case['name']}: {ex!r}")
    out["cases"].append({k: v for k, v in case.items() if k != "params"}
                        | {"params": {k: (v if not callable(v) else None)
                                      for k, v in case["params"].items()}, **res})
json.dump(rnd(out), open(f"manim-emphasis-{lib}.json", "w"), separators=(",", ":"))
print(lib, "cases", len(out["cases"]), "focus radius", FOCUS_RADIUS)
