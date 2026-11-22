# Animation blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
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


class _Uncreate(Uncreate):
    """Uncreate that gives the glyphs back their shape once they are off screen, so that
    they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # eq: x^2+5x+6=0
        eq = Tex(r"x^2+5x+6=0")
        eq_g = _glyphs(eq, [
            (-3.2801, -0.1893, 0.5184, 0.4715), (-2.7677, 0.2581, 0.3221, 0.4838), (-1.8719, -0.1534, 0.6922, 0.6933), (-0.9757, -0.0784, 0.4153, 0.7162),
            (-0.4256, -0.1893, 0.5184, 0.4715), (0.5157, -0.1534, 0.6922, 0.6933), (1.4119, -0.0784, 0.432, 0.7162), (2.3662, -0.1534, 0.6922, 0.2436),
            (3.3202, -0.0784, 0.4382, 0.7162),
        ])
        eq.move_to([0, 1.2, 0])
        eq.set_z_index(1)

        # factored: (x+2)(x+3)=0
        factored = Tex(r"(x+2)(x+3)=0")
        factored.set_color("#58C4DD")
        factored_g = _glyphs(factored, [
            (-3.8027, 0, 0.232, 1), (-3.3508, -0.0345, 0.498, 0.453), (-2.4466, 0, 0.665, 0.666), (-1.5856, 0.083, 0.399, 0.666),
            (-1.1621, 0, 0.232, 1), (-0.7312, 0, 0.232, 1), (-0.2793, -0.0345, 0.498, 0.453), (0.625, 0, 0.665, 0.666),
            (1.486, 0.072, 0.415, 0.688), (1.9095, 0, 0.232, 1), (2.7916, 0, 0.665, 0.234), (3.7082, 0.072, 0.421, 0.688),
        ])
        VGroup(factored_g[3], factored_g[8]).set_color("#FFFF00")
        factored.move_to([0, -0.8, 0])

        # 0 s – 1 s: eq write
        self.play(Write(VGroup(*eq_g[:7]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 1.8 s: eq write
        self.play(Write(VGroup(eq_g[7], eq_g[8]), stroke_color="#FFFFFF"), run_time=0.6)
        # 1.8 s – 2.2 s
        self.wait(0.4)
        eq_pivot = eq_g[6].get_center()
        eq_pivot_2 = VGroup(eq_g[3], eq_g[4]).get_center()
        # 2.2 s – 2.8 s: eq part, eq part
        self.play(
            eq_g[6].animate.scale(1.15, about_point=eq_pivot).set_color("#FFFF00"),
            VGroup(eq_g[3], eq_g[4]).animate.scale(1.15, about_point=eq_pivot_2).set_color("#FFFF00"),
            run_time=0.6,
        )
        # 2.8 s – 3 s
        self.wait(0.2)
        # 3 s – 4 s: factored write
        self.play(Write(VGroup(*factored_g[:]), stroke_color="#58C4DD"), run_time=1)
        # 4 s – 4.2 s
        self.wait(0.2)
        factored_part = VGroup(*factored_g[:5]).animate.shift(0.3 * LEFT).build()
        factored_part_2 = VGroup(*factored_g[5:10]).animate.shift(0.3 * RIGHT).build()
        # 4.2 s – 4.6 s: factored part, factored part
        self.play(_Part(factored_part, 0, 0.8), _Part(factored_part_2, 0, 0.8), run_time=0.4)
        eq_disappear = _Uncreate(VGroup(*eq_g[2:5]))
        # 4.6 s – 4.7 s: factored part, factored part, eq uncreate
        self.play(
            _Part(factored_part, 0.8, 1),
            _Part(factored_part_2, 0.8, 1),
            _Part(eq_disappear, 0, 0.2),
            run_time=0.1,
        )
        # 4.7 s – 5.1 s: eq uncreate
        self.play(_Part(eq_disappear, 0.2, 1), run_time=0.4)
        # 5.1 s – 5.4 s
        self.wait(0.3)
        # 5.4 s – 5.9 s: eq create
        self.play(ShowCreation(VGroup(*eq_g[2:5])), run_time=0.5)
        # 5.9 s – 6.2 s
        self.wait(0.3)
        # 6.2 s – 6.8 s: factored tween, eq tween
        self.play(factored.animate.shift(0.6 * UP), eq.animate.shift(0.8 * UP), run_time=0.6)
        # 6.8 s – 7.4 s
        self.wait(0.6)
        # 7.4 s – 8 s: eq fade_out, factored fade_out
        self.play(FadeOut(eq), FadeOut(factored), run_time=0.6)
