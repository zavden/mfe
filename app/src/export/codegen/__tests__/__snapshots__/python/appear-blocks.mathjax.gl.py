# Appear blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # letters: a+b+c+d+e
        letters = Tex(r"a+b+c+d+e")
        letters.set_color("#58C4DD")
        letters_g = _glyphs(letters, [
            (-3.5, 0, 0.6875, 1), (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1),
            (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
            (3.5, 0, 0.6875, 1),
        ])
        letters.move_to([0, 1, 0])
        letters.set_z_index(1)

        # one: x=1
        one = Tex(r"x=1")
        one_g = _glyphs(one, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        one.move_to([-1, -1.5, 0])

        letters_in = Write(VGroup(letters_g[0], letters_g[1]), stroke_color="#58C4DD")
        # 0 s – 0.5 s: letters write
        self.play(_Part(letters_in, 0, 0.5), run_time=0.5)
        letters_appear = FadeIn(VGroup(letters_g[2]))
        # 0.5 s – 1 s: letters write, letters fade_in
        self.play(_Part(letters_in, 0.5, 1), _Part(letters_appear, 0, 5 / 7), run_time=0.5)
        # 1 s – 1.1 s: letters fade_in
        self.play(_Part(letters_appear, 5 / 7, 6 / 7), run_time=0.1)
        one.scale(1.3, about_point=[-1, -1.5, 0]).shift(np.array([2, -0.5, 0]))
        VGroup(*one_g[:]).set_color("#FFFF00")
        # 1.1 s – 1.2 s: letters fade_in, one tween
        self.play(_Part(letters_appear, 6 / 7, 1), run_time=0.1)
        # 1.2 s – 1.4 s: one tween
        self.wait(0.2)
        letters_appear_2 = ShowCreation(VGroup(letters_g[3], letters_g[4]))
        # 1.4 s – 1.7 s: one tween, letters create
        self.play(_Part(letters_appear_2, 0, 0.375), run_time=0.3)
        # 1.7 s – 1.8 s: letters create
        self.play(_Part(letters_appear_2, 0.375, 0.5), run_time=0.1)
        letters_appear_3 = GrowFromCenter(VGroup(letters_g[5], letters_g[6]))
        # 1.8 s – 2.1 s: letters create, letters grow_from_center
        self.play(
            _Part(letters_appear_2, 0.5, 0.875),
            _Part(letters_appear_3, 0, 0.375),
            run_time=0.3,
        )
        one_appear = FadeIn(one, shift=0.5 * UP, scale=0.5)
        # 2.1 s – 2.2 s: letters create, letters grow_from_center, one fade_in
        self.play(
            _Part(letters_appear_2, 0.875, 1),
            _Part(letters_appear_3, 0.375, 0.5),
            _Part(one_appear, 0, 1 / 6),
            run_time=0.1,
        )
        # 2.2 s – 2.6 s: letters grow_from_center, one fade_in
        self.play(_Part(letters_appear_3, 0.5, 1), _Part(one_appear, 1 / 6, 5 / 6), run_time=0.4)
        # 2.6 s – 2.7 s: one fade_in
        self.play(_Part(one_appear, 5 / 6, 1), run_time=0.1)
        # 2.7 s – 2.8 s
        self.wait(0.1)
        letters_appear_4 = DrawBorderThenFill(VGroup(letters_g[7]))
        # 2.8 s – 3 s: letters draw_border_then_fill
        self.play(_Part(letters_appear_4, 0, 0.25), run_time=0.2)
        letters_appear_5 = Write(VGroup(letters_g[8]), stroke_color="#58C4DD", lag_ratio=0.3)
        # 3 s – 3.6 s: letters draw_border_then_fill, letters write
        self.play(_Part(letters_appear_4, 0.25, 1), _Part(letters_appear_5, 0, 0.75), run_time=0.6)
        # 3.6 s – 3.8 s: letters write
        self.play(_Part(letters_appear_5, 0.75, 1), run_time=0.2)
        # 3.8 s – 4 s
        self.wait(0.2)
        one_out = FadeOut(one)
        # 4 s – 4.4 s: one fade_out
        self.play(_Part(one_out, 0, 0.8), run_time=0.4)
        letters_out = FadeOut(letters)
        # 4.4 s – 4.5 s: one fade_out, letters fade_out
        self.play(_Part(one_out, 0.8, 1), _Part(letters_out, 0, 1 / 6), run_time=0.1)
        # 4.5 s – 5 s: letters fade_out
        self.play(_Part(letters_out, 1 / 6, 1), run_time=0.5)
