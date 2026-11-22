# Split clip — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 195 frames, like the editor's video export.
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
        sum.move_to([-2, 1, 0])
        sum.set_z_index(1)

        # sum_s: a+b=c
        sum_s = Tex(r"a+b=c")
        sum_s[0].set_color("#FC6255")
        sum_s.scale(1.3).move_to([1, 1.5, 0])
        sum_s.set_z_index(1)

        # result: c
        result = Tex(r"c")
        result.set_color("#83C167")
        result.scale(1.5).move_to([3, 1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum, stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 2.2 s: sum tween
        self.play(sum.animate.scale(1.3).move_to([1, 1.5, 0]), run_time=1)
        sum_disappear = FadeOut(VGroup(sum[3]))
        # 2.2 s – 2.4 s: sum fade_out
        self.play(_Part(sum_disappear, 0, 0.5), run_time=0.2)
        sum_part = sum[0].animate.set_color("#FC6255").build()
        # 2.4 s – 2.6 s: sum fade_out, sum part
        self.play(_Part(sum_disappear, 0.5, 1), _Part(sum_part, 0, 0.5), run_time=0.2)
        # 2.6 s – 2.8 s: sum part
        self.play(_Part(sum_part, 0.5, 1), run_time=0.2)
        # 2.8 s – 3 s
        self.wait(0.2)
        self.remove(*sum[:3], sum[4])
        self.add(*sum_s[:3], sum_s[4])
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: sum_s fade_in
        self.play(FadeIn(VGroup(sum_s[3])), run_time=0.5)
        # 4 s – 4.5 s: sum_s tween
        self.play(sum_s.animate.move_to([0, -1, 0]), run_time=0.5)
        # 4.5 s – 4.6 s
        self.wait(0.1)
        # 4.6 s – 5.4 s: sum_s → result
        self.play(TransformFromCopy(sum_s[4], result[0]), run_time=0.8)
        # 5.4 s – 5.5 s
        self.wait(0.1)
        # 5.5 s – 6 s: sum_s fade_out
        self.play(FadeOut(sum_s), run_time=0.5)
        # 6 s – 6.5 s: result fade_out
        self.play(FadeOut(result), run_time=0.5)
