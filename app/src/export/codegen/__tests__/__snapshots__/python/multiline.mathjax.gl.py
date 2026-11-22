# Multiline — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
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

        # rows: A &= x_1 \\ &= x_2 \\ &= x_3
        rows = Tex(r"""A &= x_1 \\
  &= x_2 \\
  &= x_3""")
        rows_g = _glyphs(rows, [
            (-3.9375, 0, 0.6875, 1), (-3.0625, 0, 0.6875, 1), (-2.1875, 0, 0.6875, 1), (-1.3125, 0, 0.6875, 1),
            (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1), (2.1875, 0, 0.6875, 1),
            (3.0625, 0, 0.6875, 1), (3.9375, 0, 0.6875, 1),
        ])
        rows.move_to([-2.5, 1, 0])

        # swap: a+b=b+a
        swap = Tex(r"a+b=b+a")
        swap.set_color("#58C4DD")
        swap_g = _glyphs(swap, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        swap.move_to([2, -1.5, 0])
        swap.set_z_index(1)

        # equals: y=2
        equals = Tex(r"y=2")
        equals.set_color("#83C167")
        equals_g = _glyphs(equals, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        equals.move_to([2.5, 1.5, 0])
        equals.set_z_index(2)

        rows_in = FadeIn(VGroup(*rows_g[:4]))
        # 0 s – 0.5 s: rows fade_in
        self.play(_Part(rows_in, 0, 0.5), run_time=0.5)
        # 0.5 s – 1 s: rows fade_in, swap fade_in
        self.play(_Part(rows_in, 0.5, 1), FadeIn(VGroup(*swap_g[:4])), run_time=0.5)
        # 1 s – 1.1 s
        self.wait(0.1)
        VGroup(*rows_g[4:]).scale(1.1, about_point=[-2.5, 1, 0]).shift(np.array([0.5, 0.3, 0]))
        rows_move = VGroup(*rows_g[:4]).animate.scale(1.1, about_point=[-2.5, 1, 0]).shift(np.array([0.5, 0.3, 0])).build()
        # 1.1 s – 1.5 s: rows tween
        self.play(_Part(rows_move, 0, 2 / 3), run_time=0.4)
        equals_in = Write(VGroup(*equals_g[:]), stroke_color="#83C167")
        # 1.5 s – 1.7 s: rows tween, equals write
        self.play(_Part(rows_move, 2 / 3, 1), _Part(equals_in, 0, 1 / 3), run_time=0.2)
        # 1.7 s – 2 s: equals write
        self.play(_Part(equals_in, 1 / 3, 5 / 6), run_time=0.3)
        rows_morph = [
            TransformFromCopy(rows_g[1], rows_g[4]),
            TransformFromCopy(rows_g[2], rows_g[5]),
        ]
        # 2 s – 2.1 s: equals write, rows morph
        self.play(_Part(equals_in, 5 / 6, 1), *(_Part(a, 0, 0.1) for a in rows_morph), run_time=0.1)
        # 2.1 s – 3 s: rows morph
        self.play(*(_Part(a, 0.1, 1) for a in rows_morph), run_time=0.9)
        rows_appear = Write(VGroup(rows_g[6]), stroke_color="#FFFFFF")
        # 3 s – 3.3 s: rows write
        self.play(_Part(rows_appear, 0, 0.5), run_time=0.3)
        rows_morph_2 = TransformFromCopy(rows_g[5], rows_g[8], rate_func=linear)
        equals_to_rows = ReplacementTransform(equals_g[1], rows_g[7])
        # 3.3 s – 3.6 s: rows write, rows morph, equals → rows
        self.play(
            _Part(rows_appear, 0.5, 1),
            _Part(rows_morph_2, 0, 0.3),
            _Part(equals_to_rows, 0, 0.3),
            run_time=0.3,
        )
        # 3.6 s – 4.3 s: rows morph, equals → rows
        self.play(_Part(rows_morph_2, 0.3, 1), _Part(equals_to_rows, 0.3, 1), run_time=0.7)
        rows_appear_2 = Write(VGroup(rows_g[9]), stroke_color="#FFFFFF")
        # 4.3 s – 4.5 s: rows write
        self.play(_Part(rows_appear_2, 0, 1 / 3), run_time=0.2)
        swap_morph = [
            ReplacementTransform(swap_g[0], swap_g[6], path_arc=60 * DEGREES),
            TransformFromCopy(swap_g[1], swap_g[5], path_arc=60 * DEGREES),
            FadeTransform(swap_g[2], swap_g[4], path_arc=60 * DEGREES),
        ]
        # 4.5 s – 4.9 s: rows write, swap morph
        self.play(
            _Part(rows_appear_2, 1 / 3, 1),
            *(_Part(a, 0, 0.4) for a in swap_morph),
            run_time=0.4,
        )
        # 4.9 s – 5 s: swap morph
        self.play(*(_Part(a, 0.4, 0.5) for a in swap_morph), run_time=0.1)
        rows_part = VGroup(*rows_g[7:]).animate.shift(0.6 * RIGHT).set_color("#FFFF00").build()
        # 5 s – 5.5 s: swap morph, rows part
        self.play(*(_Part(a, 0.5, 1) for a in swap_morph), _Part(rows_part, 0, 5 / 6), run_time=0.5)
        equals_out = FadeOut(VGroup(equals_g[0], equals_g[2]))
        # 5.5 s – 5.6 s: rows part, equals fade_out
        self.play(_Part(rows_part, 5 / 6, 1), _Part(equals_out, 0, 0.2), run_time=0.1)
        # 5.6 s – 5.8 s: equals fade_out
        self.play(_Part(equals_out, 0.2, 0.6), run_time=0.2)
        swap_move = VGroup(swap_g[1], *swap_g[3:]).animate.shift(np.array([0.5, -0.5, 0])).build()
        # 5.8 s – 6 s: equals fade_out, swap tween
        self.play(_Part(equals_out, 0.6, 1), _Part(swap_move, 0, 0.4), run_time=0.2)
        # 6 s – 6.3 s: swap tween
        self.play(_Part(swap_move, 0.4, 1), run_time=0.3)
        # 6.3 s – 6.5 s
        self.wait(0.2)
        # 6.5 s – 7 s: swap fade_out
        self.play(FadeOut(VGroup(swap_g[1], *swap_g[3:])), run_time=0.5)
        # 7 s – 7.5 s
        self.wait(0.5)
        # 7.5 s – 8 s: rows fade_out
        self.play(FadeOut(rows), run_time=0.5)
