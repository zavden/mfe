# A chain of two relations — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl AChainOfTwoRelations.py AChainOfTwoRelations -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
from manimlib import *


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


class AChainOfTwoRelations(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # first: a+b
        first = Tex(r"a+b", font_size=148.4832)
        first_g = _glyphs(first, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        first_g[0].set_color("#F4C867")
        first_g[2].set_color("#58C4DD")
        first.set_z_index(2)

        # second: b+a
        second = Tex(r"b+a", font_size=148.4832)
        second_g = _glyphs(second, [
            (-1.1182, 0.0457, 0.4923, 0.9085), (-0.0754, -0.0715, 0.8582, 0.857), (1.0595, -0.1166, 0.6095, 0.5812),
        ])
        second_g[0].set_color("#58C4DD")
        second_g[2].set_color("#F4C867")
        second.set_z_index(1)

        # third: a+b
        third = Tex(r"a+b", font_size=148.4832)
        third_g = _glyphs(third, [
            (-1.0744, -0.1166, 0.6095, 0.5812), (0.0477, -0.0715, 0.8582, 0.857), (1.133, 0.0457, 0.4923, 0.9085),
        ])
        third_g[0].set_color("#F4C867")
        third_g[2].set_color("#58C4DD")

        # 0 s – 1 s: first write
        self.play(Write(VGroup(*first_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.8 s
        self.wait(0.8)
        first_to_second = [
            ReplacementTransform(first_g[0], second_g[2]),
            ReplacementTransform(first_g[1], second_g[1]),
            ReplacementTransform(first_g[2], second_g[0]),
        ]
        # 1.8 s – 2.2 s: first → second
        self.play(*(_Part(a, 0, 1 / 3) for a in first_to_second), run_time=0.4)
        self.add(third)
        # 2.2 s – 3 s: first → second
        self.play(*(_Part(a, 1 / 3, 1) for a in first_to_second), run_time=0.8)
        # 3 s – 6 s
        self.wait(3)
        self.remove(second)
        # 6 s – 7 s
        self.wait(1)
