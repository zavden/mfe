# Relations twice — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 210 frames, like the editor's video export.
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
        swap = MathTex(r"c=a+b", color="#83C167")
        swap.move_to([0, -1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        sum_to_swap = ReplacementTransform(sum[0][0], swap[0][2])
        # 1.5 s – 2 s: sum → swap
        self.play(_Part(sum_to_swap, 0, 0.5), run_time=0.5)
        sum_to_swap_2 = [
            ReplacementTransform(sum[0][4], swap[0][0]),
            ReplacementTransform(sum[0][2].copy(), swap[0][4]),
        ]
        # 2 s – 2.5 s: sum → swap, sum → swap
        self.play(
            _Part(sum_to_swap, 0.5, 1),
            *(_Part(a, 0, 0.5) for a in sum_to_swap_2),
            run_time=0.5,
        )
        # 2.5 s – 3 s: sum → swap
        self.play(*(_Part(a, 0.5, 1) for a in sum_to_swap_2), run_time=0.5)
        # 3 s – 4 s
        self.wait(1)
        # 4 s – 4.6 s: sum → swap
        self.play(
            ReplacementTransform(sum[0][3], swap[0][1], path_arc=90 * DEGREES),
            FadeTransform(sum[0][1], swap[0][3], path_arc=90 * DEGREES),
            run_time=0.6,
        )
        # 4.6 s – 5.5 s
        self.wait(0.9)
        # 5.5 s – 6 s: sum fade_out
        self.play(FadeOut(sum[0][2]), run_time=0.5)
        # 6 s – 6.5 s
        self.wait(0.5)
        # 6.5 s – 7 s: swap fade_out
        self.play(FadeOut(swap), run_time=0.5)
