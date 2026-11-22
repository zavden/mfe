"""Native endpoints for shared dimensions from free-mode metrics and target overrides.

Generate current Python using MFE_GEOMETRY_OUTPUT=<dir> vitest run attachmentGeometry.test.ts,
then run with each installed engine interpreter: geometry_native.py ce|gl <dir>. Constructors,
glyph binding, placement, animation and scene membership are real; only the renderer/clock is
replaced. The export frame suite separately renders the exact/positional geometry cases.
"""
import ast
import json
import math
import sys
from pathlib import Path
from types import SimpleNamespace

TARGET, DIRECTORY = sys.argv[1], Path(sys.argv[2])
if TARGET == 'ce':
    from manim import Scene as RealScene
    from manim.animation.animation import prepare_animation
else:
    from manimlib import Scene as RealScene
    from manimlib.animation.animation import prepare_animation


class ProbeScene(RealScene):
    def __init__(self, meta):
        camera = SimpleNamespace(use_z_index=True, background_color=None)
        if TARGET == 'ce':
            self.renderer = SimpleNamespace(camera=camera)
            self.foreground_mobjects, self.moving_mobjects = [], []
        else:
            self.camera = camera
            self.id_to_mobject_map = {}
        self.mobjects, self.tracked, self.glyphs = [], {}, {}
        self.probe_time, self.samples, self.times = 0, {}, meta['samples']

    def observe(self, time):
        for requested in self.times:
            if not math.isclose(time, requested, abs_tol=2e-6):
                continue
            members = self.get_mobject_family_members()
            self.samples[requested] = {
                name: {
                    'width': float(obj.get_width()), 'height': float(obj.get_height()),
                    'glyphs': [self.paint(glyph, glyph in members) for glyph in self.glyphs[name]],
                }
                for name, obj in self.tracked.items()
            }

    def paint(self, glyph, present):
        if TARGET == 'ce':
            color = glyph.get_stroke_rgbas()[0]
        else:
            color = glyph.data.rows_or_defaults['stroke_rgba'][0]
        return {'present': present, 'stroke': list(map(float, color))}

    def wait(self, duration):
        for time in self.times:
            if self.probe_time <= time <= self.probe_time + duration:
                self.observe(time)
        self.probe_time += duration

    def play(self, *builders, run_time):
        animations = [prepare_animation(builder) for builder in builders]
        for animation in animations:
            if TARGET == 'ce':
                animation._setup_scene(self)
            if animation.mobject not in self.get_mobject_family_members():
                self.add(animation.mobject)
            animation.begin()
        points = {self.probe_time, self.probe_time + run_time}
        points.update(t for t in self.times if self.probe_time <= t <= self.probe_time + run_time)
        for time in sorted(points):
            for animation in animations:
                animation.interpolate(min(1, max(0, (time - self.probe_time) / run_time)))
            self.observe(time)
        for animation in animations:
            animation.finish()
            animation.clean_up_from_scene(self)
        self.probe_time += run_time
        self.observe(self.probe_time)


def close(actual, expected, message):
    assert math.isclose(actual, expected, abs_tol=3e-6), (message, actual, expected)


records = []
for path in sorted(DIRECTORY.glob(f'free-*-to-{TARGET}.json')):
    meta = json.loads(path.read_text(encoding="utf-8"))
    source = path.with_suffix('.py')
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    scene = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                 and node.name == meta['sceneName'])
    construct = next(node for node in scene.body if isinstance(node, ast.FunctionDef)
                     and node.name == 'construct')
    body = []
    for statement in construct.body:
        body.append(statement)
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if not isinstance(target, ast.Name):
            continue
        name = target.id
        if name in meta['expected']:
            body += ast.parse(f'self.tracked[{name!r}] = {name}').body
        if name.endswith('_g') and name[:-2] in meta['expected']:
            body += ast.parse(f'self.glyphs[{name[:-2]!r}] = {name}').body
    construct.body = body
    ast.fix_missing_locations(tree)
    namespace = {'__name__': 'geometry_endpoints'}
    exec(compile(tree, str(source), 'exec'), namespace)
    runner = ProbeScene(meta)
    namespace[meta['sceneName']].construct(runner)
    assert len(runner.samples) == len(meta['samples']), runner.samples.keys()
    for time, sample in runner.samples.items():
        for name, expected in meta['expected'].items():
            actual = sample[name]
            close(actual['width'], expected['width'] * expected['scale'], (name, time, 'width'))
            close(actual['height'], expected['height'] * expected['scale'], (name, time, 'height'))
            for index, glyph in enumerate(actual['glyphs']):
                assert glyph['present'] == (time >= expected['start']), (name, time, glyph)
                opacity = 0.2 if index == 0 and expected['start'] == 3 and time >= 3.5 else expected['opacity']
                close(glyph['stroke'][3], opacity, (name, time, index, 'opacity'))
                color = expected['glyphColors'].get(str(index), expected['color'])
                for channel, offset in enumerate([1, 3, 5]):
                    close(glyph['stroke'][channel], int(color[offset:offset + 2], 16) / 255,
                          (name, time, index, 'color'))
    records.append({'case': path.stem, 'samples': runner.samples, 'status': 'passed'})
assert records, 'No generated current-source cases found'
(DIRECTORY / f'results-{TARGET}.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps([{'case': row['case'], 'status': row['status']} for row in records]))
