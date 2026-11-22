# Relation styles — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manimlib import *


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

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap[3].set_color("#FFFF00")
        swap.move_to([0, -1, 0])

        # x: x
        x = Tex(r"x")
        x.set_color("#FC6255")
        x.scale(2).move_to([3, 0, 0])
        x.set_z_index(2)

        # 0 s – 1 s: sum write
        self.play(Write(sum, stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2 s: sum → swap, swap fade_in
        self.play(
            ReplacementTransform(sum[0], swap[2], path_arc=90 * DEGREES),
            ReplacementTransform(sum[2], swap[4], path_arc=90 * DEGREES),
            TransformFromCopy(sum[4], swap[0], path_arc=90 * DEGREES),
            FadeTransform(sum[3], swap[1], path_arc=90 * DEGREES),
            FadeIn(VGroup(swap[3])),
            run_time=1,
        )
        # 2 s – 2.5 s
        self.wait(0.5)
        swap[3].set_z_index(2)
        swap_to_x = FadeTransform(swap[3], x[0], path_arc=-60 * DEGREES, rate_func=linear)
        # 2.5 s – 3 s: swap → x
        self.play(_Part(swap_to_x, 0, 0.5), run_time=0.5)
        sum_out = FadeOut(VGroup(sum[1], sum[4]))
        # 3 s – 3.5 s: swap → x, sum fade_out
        self.play(_Part(swap_to_x, 0.5, 1), _Part(sum_out, 0, 0.5), run_time=0.5)
        # 3.5 s – 4 s: sum fade_out
        self.play(_Part(sum_out, 0.5, 1), run_time=0.5)
        swap_out = FadeOut(VGroup(*swap[:3], swap[4]))
        # 4 s – 4.5 s: swap fade_out
        self.play(_Part(swap_out, 0, 0.5), run_time=0.5)
        # 4.5 s – 5 s: swap fade_out, x fade_out
        self.play(_Part(swap_out, 0.5, 1), FadeOut(x), run_time=0.5)
