# Relation styles — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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

        # sum: a+b=c
        sum = MathTex(r"a+b=c")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = MathTex(r"c=a+b")
        swap[0][3].set_color("#FFFF00")
        swap.move_to([0, -1, 0])

        # x: x
        x = MathTex(r"x", color="#FC6255")
        x.scale(2).move_to([3, 0, 0])
        x.set_z_index(2)

        # 0 s – 1 s: sum write
        self.play(Write(sum), run_time=1)
        # 1 s – 2 s: sum → swap, swap fade_in
        self.play(
            ReplacementTransform(sum[0][0], swap[0][2], path_arc=90 * DEGREES),
            ReplacementTransform(sum[0][2], swap[0][4], path_arc=90 * DEGREES),
            ReplacementTransform(sum[0][4].copy(), swap[0][0], path_arc=90 * DEGREES),
            FadeTransform(sum[0][3], swap[0][1], path_arc=90 * DEGREES),
            FadeIn(swap[0][3]),
            run_time=1,
        )
        # 2 s – 2.5 s
        self.wait(0.5)
        swap[0][3].set_z_index(2)
        swap_to_x = FadeTransform(swap[0][3], x[0][0], path_arc=-60 * DEGREES, rate_func=linear)
        # 2.5 s – 3 s: swap → x
        self.play(_Part(swap_to_x, 0, 0.5), run_time=0.5)
        sum_out = FadeOut(VGroup(sum[0][1], sum[0][4]))
        # 3 s – 3.5 s: swap → x, sum fade_out
        self.play(_Part(swap_to_x, 0.5, 1), _Part(sum_out, 0, 0.5), run_time=0.5)
        # 3.5 s – 4 s: sum fade_out
        self.play(_Part(sum_out, 0.5, 1), run_time=0.5)
        swap_out = FadeOut(VGroup(*swap[0][:3], swap[0][4]))
        # 4 s – 4.5 s: swap fade_out
        self.play(_Part(swap_out, 0, 0.5), run_time=0.5)
        # 4.5 s – 5 s: swap fade_out, x fade_out
        self.play(_Part(swap_out, 0.5, 1), FadeOut(x), run_time=0.5)
