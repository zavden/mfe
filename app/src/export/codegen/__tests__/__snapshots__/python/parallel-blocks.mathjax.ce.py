# Parallel blocks — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sides: a+b=c+d
        sides = MathTex(r"a+b=c+d", color="#58C4DD")
        sides_g = _glyphs(sides, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        sides.move_to([0, 1, 0])
        sides.set_z_index(1)

        # pair: x=y+1
        pair = MathTex(r"x=y+1")
        pair_g = _glyphs(pair, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        pair.move_to([0, -1.5, 0])

        sides_in = Write(sides_g[3])
        # 0 s – 0.5 s: sides write
        self.play(_Part(sides_in, 0, 5 / 6), run_time=0.5)
        pair_in = FadeIn(VGroup(*pair_g[:4]))
        # 0.5 s – 0.6 s: sides write, pair fade_in
        self.play(_Part(sides_in, 5 / 6, 1), _Part(pair_in, 0, 0.2), run_time=0.1)
        # 0.6 s – 1 s: pair fade_in
        self.play(_Part(pair_in, 0.2, 1), run_time=0.4)
        sides_part = sides_g[3].animate.shift(0.4 * UP).set_color("#FFFF00").build()
        sides_appear = Write(VGroup(*sides_g[:3]))
        sides_appear_2 = Write(VGroup(*sides_g[4:]), lag_ratio=0.4)
        # 1 s – 1.5 s: sides part, sides write, sides write
        self.play(
            _Part(sides_part, 0, 0.5),
            _Part(sides_appear, 0, 0.5),
            _Part(sides_appear_2, 0, 0.5),
            run_time=0.5,
        )
        pair_disappear = FadeOut(pair_g[0])
        pair_appear = Write(pair_g[4])
        # 1.5 s – 2 s: sides part, sides write, sides write, pair fade_out, pair write
        self.play(
            _Part(sides_part, 0.5, 1),
            _Part(sides_appear, 0.5, 1),
            _Part(sides_appear_2, 0.5, 1),
            _Part(pair_disappear, 0, 5 / 7),
            _Part(pair_appear, 0, 5 / 7),
            run_time=0.5,
        )
        # 2 s – 2.2 s: pair fade_out, pair write
        self.play(_Part(pair_disappear, 5 / 7, 1), _Part(pair_appear, 5 / 7, 1), run_time=0.2)
        # 2.2 s – 2.7 s
        self.wait(0.5)
        pair_disappear_2 = Uncreate(pair_g[2])
        # 2.7 s – 3 s: pair uncreate
        self.play(_Part(pair_disappear_2, 0, 0.375), run_time=0.3)
        sides_disappear = Unwrite(VGroup(*sides_g[:3]))
        sides_disappear_2 = FadeOut(VGroup(*sides_g[4:]), shift=0.5 * RIGHT)
        # 3 s – 3.1 s: pair uncreate, sides unwrite, sides fade_out
        self.play(
            _Part(pair_disappear_2, 0.375, 0.5),
            _Part(sides_disappear, 0, 0.125),
            _Part(sides_disappear_2, 0, 0.125),
            run_time=0.1,
        )
        pair_appear_2 = FadeIn(pair_g[0], shift=0.5 * LEFT)
        # 3.1 s – 3.5 s: pair uncreate, sides unwrite, sides fade_out, pair fade_in
        self.play(
            _Part(pair_disappear_2, 0.5, 1),
            _Part(sides_disappear, 0.125, 0.625),
            _Part(sides_disappear_2, 0.125, 0.625),
            _Part(pair_appear_2, 0, 2 / 3),
            run_time=0.4,
        )
        # 3.5 s – 3.7 s: sides unwrite, sides fade_out, pair fade_in
        self.play(
            _Part(sides_disappear, 0.625, 0.875),
            _Part(sides_disappear_2, 0.625, 0.875),
            _Part(pair_appear_2, 2 / 3, 1),
            run_time=0.2,
        )
        # 3.7 s – 3.8 s: sides unwrite, sides fade_out
        self.play(
            _Part(sides_disappear, 0.875, 1),
            _Part(sides_disappear_2, 0.875, 1),
            run_time=0.1,
        )
        # 3.8 s – 4 s
        self.wait(0.2)
        # 4 s – 4.5 s: pair fade_out
        self.play(FadeOut(VGroup(pair_g[0], pair_g[1], pair_g[3], pair_g[4])), run_time=0.5)
        # 4.5 s – 5 s: sides fade_out
        self.play(FadeOut(sides_g[3]), run_time=0.5)
