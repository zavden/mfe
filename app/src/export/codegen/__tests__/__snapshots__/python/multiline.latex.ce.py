# Multiline — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
from manim import *


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

        # rows: A &= x_1 \\ &= x_2 \\ &= x_3
        rows = MathTex(r"""A &= x_1 \\
  &= x_2 \\
  &= x_3""")
        rows.move_to([-2.5, 1, 0])

        # swap: a+b=b+a
        swap = MathTex(r"a+b=b+a", color="#58C4DD")
        swap.move_to([2, -1.5, 0])
        swap.set_z_index(1)

        # equals: y=2
        equals = MathTex(r"y=2", color="#83C167")
        equals.move_to([2.5, 1.5, 0])
        equals.set_z_index(2)

        rows_in = FadeIn(rows[0][:4])
        # 0 s – 0.5 s: rows fade_in
        self.play(_Part(rows_in, 0, 0.5), run_time=0.5)
        # 0.5 s – 1 s: rows fade_in, swap fade_in
        self.play(_Part(rows_in, 0.5, 1), FadeIn(swap[0][:4]), run_time=0.5)
        # 1 s – 1.1 s
        self.wait(0.1)
        rows[0][4:].scale(1.1, about_point=[-2.5, 1, 0]).shift(np.array([0.5, 0.3, 0]))
        rows_move = rows[0][:4].animate.scale(1.1, about_point=[-2.5, 1, 0]).shift(np.array([0.5, 0.3, 0])).build()
        # 1.1 s – 1.5 s: rows tween
        self.play(_Part(rows_move, 0, 2 / 3), run_time=0.4)
        equals_in = Write(equals)
        # 1.5 s – 1.7 s: rows tween, equals write
        self.play(_Part(rows_move, 2 / 3, 1), _Part(equals_in, 0, 1 / 3), run_time=0.2)
        # 1.7 s – 2 s: equals write
        self.play(_Part(equals_in, 1 / 3, 5 / 6), run_time=0.3)
        rows_morph = [
            ReplacementTransform(rows[0][1].copy(), rows[0][4]),
            ReplacementTransform(rows[0][2].copy(), rows[0][5]),
        ]
        # 2 s – 2.1 s: equals write, rows morph
        self.play(_Part(equals_in, 5 / 6, 1), *(_Part(a, 0, 0.1) for a in rows_morph), run_time=0.1)
        # 2.1 s – 3 s: rows morph
        self.play(*(_Part(a, 0.1, 1) for a in rows_morph), run_time=0.9)
        rows_appear = Write(rows[0][6])
        # 3 s – 3.3 s: rows write
        self.play(_Part(rows_appear, 0, 0.5), run_time=0.3)
        rows_morph_2 = ReplacementTransform(rows[0][5].copy(), rows[0][8], rate_func=linear)
        equals_to_rows = ReplacementTransform(equals[0][1], rows[0][7])
        # 3.3 s – 3.6 s: rows write, rows morph, equals → rows
        self.play(
            _Part(rows_appear, 0.5, 1),
            _Part(rows_morph_2, 0, 0.3),
            _Part(equals_to_rows, 0, 0.3),
            run_time=0.3,
        )
        # 3.6 s – 4.3 s: rows morph, equals → rows
        self.play(_Part(rows_morph_2, 0.3, 1), _Part(equals_to_rows, 0.3, 1), run_time=0.7)
        rows_appear_2 = Write(rows[0][9])
        # 4.3 s – 4.5 s: rows write
        self.play(_Part(rows_appear_2, 0, 1 / 3), run_time=0.2)
        swap_morph = [
            ReplacementTransform(swap[0][0], swap[0][6], path_arc=60 * DEGREES),
            ReplacementTransform(swap[0][1].copy(), swap[0][5], path_arc=60 * DEGREES),
            FadeTransform(swap[0][2], swap[0][4], path_arc=60 * DEGREES),
        ]
        # 4.5 s – 4.9 s: rows write, swap morph
        self.play(
            _Part(rows_appear_2, 1 / 3, 1),
            *(_Part(a, 0, 0.4) for a in swap_morph),
            run_time=0.4,
        )
        # 4.9 s – 5 s: swap morph
        self.play(*(_Part(a, 0.4, 0.5) for a in swap_morph), run_time=0.1)
        rows_part = rows[0][7:].animate.shift(0.6 * RIGHT).set_color("#FFFF00").build()
        # 5 s – 5.5 s: swap morph, rows part
        self.play(*(_Part(a, 0.5, 1) for a in swap_morph), _Part(rows_part, 0, 5 / 6), run_time=0.5)
        equals_out = FadeOut(VGroup(equals[0][0], equals[0][2]))
        # 5.5 s – 5.6 s: rows part, equals fade_out
        self.play(_Part(rows_part, 5 / 6, 1), _Part(equals_out, 0, 0.2), run_time=0.1)
        # 5.6 s – 5.8 s: equals fade_out
        self.play(_Part(equals_out, 0.2, 0.6), run_time=0.2)
        swap_move = VGroup(swap[0][1], *swap[0][3:]).animate.shift(np.array([0.5, -0.5, 0])).build()
        # 5.8 s – 6 s: equals fade_out, swap tween
        self.play(_Part(equals_out, 0.6, 1), _Part(swap_move, 0, 0.4), run_time=0.2)
        # 6 s – 6.3 s: swap tween
        self.play(_Part(swap_move, 0.4, 1), run_time=0.3)
        # 6.3 s – 6.5 s
        self.wait(0.2)
        # 6.5 s – 7 s: swap fade_out
        self.play(FadeOut(VGroup(swap[0][1], *swap[0][3:])), run_time=0.5)
        # 7 s – 7.5 s
        self.wait(0.5)
        # 7.5 s – 8 s: rows fade_out
        self.play(FadeOut(rows), run_time=0.5)
