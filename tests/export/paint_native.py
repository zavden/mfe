"""Current-source paint/name/membership regressions with real CE/GL mobjects and animations.

Generate inputs with node tests/export/generate-paint.mjs <dir> from the repository root, then
run this file with each engine interpreter: paint_native.py ce|gl <dir>. Scene construction
is skipped; its real add/remove/family operations run, while the clock samples requested
times without rendering. The export frame suite separately checks actual renderer behavior.
"""
import ast
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

TARGET, DIRECTORY = sys.argv[1], Path(sys.argv[2])
manifest = json.loads(DIRECTORY.joinpath("manifest.json").read_text(encoding="utf-8"))[TARGET]
expected_cases = manifest["paint"] + manifest["namespace"]
assert manifest["paint"] and manifest["namespace"], "incomplete paint/namespace manifest"
assert len(expected_cases) == len(set(expected_cases)), "duplicate native cases"
meta_paths = sorted(path for path in DIRECTORY.glob(f"*-{TARGET}.json")
                    if not path.name.startswith("results-"))
assert [path.stem for path in meta_paths] == sorted(expected_cases), "native artifacts differ from manifest"
assert all(path.with_suffix(".py").is_file() for path in meta_paths), "missing generated Python"

if TARGET == "ce":
    from manim import Scene as RealScene
    from manim.animation.animation import prepare_animation
else:
    from manimlib import Scene as RealScene
    from manimlib.animation.animation import prepare_animation


def paint(glyph):
    if TARGET == "ce":
        fill = glyph.get_fill_rgbas()[0]
        stroke = glyph.get_stroke_rgbas()[0]
        widths = [glyph.get_stroke_width()]
    else:
        fill = glyph.uniforms["fill_rgba"]
        stroke = glyph.data.rows_or_defaults["stroke_rgba"][0]
        widths = glyph.get_stroke_widths().reshape(-1)
    return {"fill": list(map(float, fill)), "stroke": list(map(float, stroke)),
            "widths": list(map(float, widths))}


class ProbeScene(RealScene):
    def __init__(self, meta):
        # Only the renderer/clock is replaced; membership uses the engine's Scene methods.
        camera = SimpleNamespace(use_z_index=True, background_color=None)
        if TARGET == "ce":
            self.renderer = SimpleNamespace(camera=camera)
            self.foreground_mobjects, self.moving_mobjects = [], []
        else:
            self.camera = camera
            self.id_to_mobject_map = {}
        self.mobjects, self.watched = [], []
        self.probe_time = 0
        self.samples = {}
        self.times = [sample["time"] for sample in meta["samples"]]

    def observe(self, time):
        for requested in self.times:
            if math.isclose(time, requested, abs_tol=2e-6):
                members = self.get_mobject_family_members()
                self.samples[requested] = [
                    {**paint(glyph), "present": glyph in members}
                    for glyph in self.watched
                ]

    def wait(self, duration):
        for time in self.times:
            if self.probe_time <= time <= self.probe_time + duration:
                self.observe(time)
        self.probe_time += duration

    def play(self, *builders, run_time):
        animations = [prepare_animation(builder) for builder in builders]
        for animation in animations:
            if TARGET == "ce":
                animation._setup_scene(self)
            # Scene.begin_animations adds only objects not already in its family. This
            # matters for `_Part` and a fresh Unwrite group over an existing Cross.
            if animation.mobject not in self.get_mobject_family_members():
                self.add(animation.mobject)
            animation.begin()
        points = {self.probe_time, self.probe_time + run_time}
        points.update(t for t in self.times if self.probe_time <= t <= self.probe_time + run_time)
        for time in sorted(points):
            alpha = min(1, max(0, (time - self.probe_time) / run_time))
            for animation in animations:
                animation.interpolate(alpha)
            self.observe(time)
        for animation in animations:
            animation.finish()
            animation.clean_up_from_scene(self)
        self.probe_time += run_time
        self.observe(self.probe_time)


def close(actual, expected, message, tolerance=1e-6):
    assert math.isclose(actual, expected, abs_tol=tolerance), (message, actual, expected)


def compare(meta, runner):
    assert len(runner.watched) == (2 if meta["cross"] else 1), "missing canonical glyphs"
    assert len(runner.samples) == len(meta["samples"]), (runner.samples.keys(), meta["samples"])
    for sample in meta["samples"]:
        time = sample["time"]
        actual = runner.samples[time]
        expected = {glyph["glyph"]: glyph for glyph in sample["glyphs"]}
        if meta["check"] == "membership":
            # During the erase both canonical lines remain members (possibly degenerate).
            # After cleanup neither does; after reappearance both original lines do again.
            wanted = bool(expected)
            assert all(glyph["present"] == wanted for glyph in actual), (time, actual, expected)
            continue
        assert len(actual) == len(expected), (time, actual, expected)
        for index, glyph in enumerate(actual):
            assert glyph["present"], (time, index, "missing scene member")
            for channel in ["fill", "stroke"]:
                value = expected[index][channel]
                close(glyph[channel][3], value["opacity"] if value else 0,
                      (time, index, channel, "opacity"))
                if value:
                    rgb = [int(value["color"][i:i + 2], 16) / 255 for i in [1, 3, 5]]
                    for a, b in zip(glyph[channel][:3], rgb):
                        close(a, b, (time, index, channel, "color"), 1 / 255 + 1e-6)
            stroke = expected[index]["stroke"]
            if stroke and meta["check"] == "width":
                assert glyph["widths"], (time, index, "empty widths")
                for width in glyph["widths"]:
                    close(width, stroke["width"], (time, index, "stroke width"))


results = []
for meta_path in meta_paths:
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    source = meta_path.with_suffix(".py")
    result = {"case": meta_path.stem}
    try:
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        scene = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                     and node.name == meta["sceneName"])
        construct = next(node for node in scene.body if isinstance(node, ast.FunctionDef)
                         and node.name == "construct")
        variable = meta["variable"]
        # Save the original canonical line references before Unwrite reverses its own group.
        watch = f"self.watched = list({variable}.submobjects)" if meta["cross"] else f"self.watched = [{variable}]"
        body = []
        for statement in construct.body:
            body.append(statement)
            if isinstance(statement, ast.Assign) and any(
                    isinstance(name, ast.Name) and name.id == variable for name in statement.targets):
                body.extend(ast.parse(watch).body)
        construct.body = body
        ast.fix_missing_locations(tree)
        namespace = {"__name__": "paint_regression"}
        exec(compile(tree, str(source), "exec"), namespace)
        runner = ProbeScene(meta)
        namespace[meta["sceneName"]].construct(runner)
        compare(meta, runner)
        result.update(ok=True, samples=runner.samples)
    except Exception as error:
        result.update(ok=False, error=f"{type(error).__name__}: {error}")
        print(f"FAIL {meta_path.stem}: {result['error']}")
    results.append(result)

DIRECTORY.joinpath(f"results-{TARGET}.json").write_text(json.dumps(results, indent=2) + "\n")
failed = sum(not result["ok"] for result in results)
print(f"{TARGET}: {len(results) - failed}/{len(results)} native paint/name cases passed")
sys.exit(1 if failed else 0)
