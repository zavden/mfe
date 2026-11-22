# Picking glyphs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 PickingGlyphs.py PickingGlyphs
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
from manim import *


def _glyphs(tex, layout):
    """The glyphs of `tex` in the editor's order. That order (MathJax's, or another
    template's) can differ from Manim's, so the glyphs are matched by position: `layout`
    holds each glyph's (x, y, width, height) relative to the formula centre, divided by the
    formula height, and every real glyph is assigned to one entry with the least total
    distance. Entries without a counterpart get an empty VMobject."""
    from scipy.optimize import linear_sum_assignment

    real = tex.family_members_with_points()
    glyphs = [VMobject() for _ in layout]
    if len(real) != len(layout):
        print(f"Warning: Manim made {len(real)} glyphs of a formula the editor split into "
              f"{len(layout)}; unmatched glyphs are not animated.")
    if not real or not layout:
        return glyphs  # nothing to match (a formula without ink, such as \quad)
    centre, height = tex.get_center(), tex.get_height()
    if height < 1e-6:
        height = 1.0  # a flat mobject (a rule): the editor's layout is divided by 1 then too
    have = np.array([
        [*((g.get_center() - centre)[:2] / height), g.get_width() / height, g.get_height() / height]
        for g in real
    ])
    want = np.array(layout, dtype=float)
    cost = np.linalg.norm(want[:, None, :] - have[None, :, :], axis=2)
    for i, j in zip(*linear_sum_assignment(cost)):
        glyphs[i] = real[j]
    return glyphs


class _Part(Animation):
    """Plays the stretch [a0, a1] of `anim` (fractions of its run time) inside one
    self.play, so that animations that overlap in time can start and end between plays.
    The animation begins in its part with a0 == 0 and finishes (and leaves or enters the
    scene) in its part with a1 == 1; it keeps its own rate function and lag throughout."""

    def __init__(self, anim, a0, a1):
        self.anim, self.a0, self.a1 = anim, a0, a1
        super().__init__(anim.mobject, rate_func=linear)

    def begin(self):
        if self.a0 == 0:
            self.anim.begin()

    def _setup_scene(self, scene):  # ManimCE: introducers add their mobject here
        if self.a0 == 0:
            self.anim._setup_scene(scene)

    def is_introducer(self):  # ManimCE
        return self.anim.is_introducer()

    def interpolate(self, alpha):
        self.anim.interpolate(self.a0 + (self.a1 - self.a0) * alpha)

    def update_mobjects(self, dt):  # ManimCE
        self.anim.update_mobjects(dt)

    def update_reference_mobjects(self, dt, **kwargs):  # ManimGL
        self.anim.update_reference_mobjects(dt, **kwargs)

    def finish(self):
        if self.a1 == 1:
            self.anim.finish()
        else:
            self.anim.interpolate(self.a1)

    def clean_up_from_scene(self, scene):
        if self.a1 == 1:
            self.anim.clean_up_from_scene(scene)


class PickingGlyphs(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # sum: (a+b)^2 = a^2 + 2ab + b^2
        sum = MathTex(r"(a+b)^2 = a^2 + 2ab + b^2", font_size=72)
        sum_g = _glyphs(sum, [
            (-4.4289, -0.059, 0.2108, 0.8819), (-4.0364, -0.0895, 0.4172, 0.3978), (-3.2685, -0.0586, 0.5874, 0.5865), (-2.5257, 0.0217, 0.3369, 0.6218),
            (-2.1972, -0.059, 0.2108, 0.8819), (-1.8233, 0.2924, 0.2488, 0.4153), (-1.0349, -0.059, 0.5874, 0.2064), (-0.2091, -0.0895, 0.4172, 0.3978),
            (0.2044, 0.2924, 0.2488, 0.4153), (0.9437, -0.0586, 0.5874, 0.5865), (1.7029, 0.0142, 0.3519, 0.5874), (2.1615, -0.0895, 0.4172, 0.3978),
            (2.5941, 0.0217, 0.3369, 0.6218), (3.3078, -0.0586, 0.5874, 0.5865), (4.0506, 0.0217, 0.3369, 0.6218), (4.4099, 0.2924, 0.2488, 0.4153),
        ])
        VGroup(*sum_g[10:13]).set_color("#FC6255")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # diff: (a-b)^2 = a^2 - 2ab + b^2
        diff = MathTex(r"(a-b)^2 = a^2 - 2ab + b^2", font_size=72)
        diff_g = _glyphs(diff, [
            (-4.4289, -0.059, 0.2108, 0.8819), (-4.0364, -0.0895, 0.4172, 0.3978), (-3.2685, -0.059, 0.538, 0.0353), (-2.5257, 0.0217, 0.3369, 0.6218),
            (-2.1972, -0.059, 0.2108, 0.8819), (-1.8233, 0.2924, 0.2488, 0.4153), (-1.0349, -0.059, 0.5874, 0.2064), (-0.2091, -0.0895, 0.4172, 0.3978),
            (0.2044, 0.2924, 0.2488, 0.4153), (0.9437, -0.059, 0.538, 0.0353), (1.7029, 0.0142, 0.3519, 0.5874), (2.1615, -0.0895, 0.4172, 0.3978),
            (2.5941, 0.0217, 0.3369, 0.6218), (3.3078, -0.0586, 0.5874, 0.5865), (4.0506, 0.0217, 0.3369, 0.6218), (4.4099, 0.2924, 0.2488, 0.4153),
        ])
        VGroup(*diff_g[10:13]).set_color("#FC6255")
        diff.move_to([0, -1.5, 0])

        # b1: brace, built on sum and diff where its clip starts

        sum_in = Write(VGroup(*sum_g[:]))
        # 0 s – 0.6 s: sum write
        self.play(_Part(sum_in, 0, 0.5), run_time=0.6)
        diff_in = Write(VGroup(*diff_g[:]))
        # 0.6 s – 1.2 s: sum write, diff write
        self.play(_Part(sum_in, 0.5, 1), _Part(diff_in, 0, 0.5), run_time=0.6)
        # 1.2 s – 1.8 s: diff write
        self.play(_Part(diff_in, 0.5, 1), run_time=0.6)
        # 1.8 s – 3 s
        self.wait(1.2)
        b1 = Brace(VGroup(sum_g[15], diff_g[15]), RIGHT, buff=0.2)
        b1.set_z_index(2)
        self.add(b1)
        # 3 s – 10 s
        self.wait(7)
