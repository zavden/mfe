# Split left out — exported by Manim Formula Editor for ManimGL 1.7.
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
        sum.move_to([-1, 1, 0])
        sum.set_z_index(1)

        # result: c
        result = Tex(r"c")
        result.set_color("#83C167")
        result.scale(1.5).move_to([2.5, -1, 0])

        # sum_s: a+b=c
        sum_s = Tex(r"a+b=c")
        sum_s.move_to([0, 1.5, 0])
        sum_s.set_z_index(1)

        # 0 s – 1 s: sum write
        self.play(Write(sum[:3], stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        sum[3:].shift(np.array([1, 0.5, 0]))
        sum_move = sum[:3].animate.shift(np.array([1, 0.5, 0])).build()
        # 1.5 s – 2 s: sum tween
        self.play(_Part(sum_move, 0, 0.5), run_time=0.5)
        # 2 s – 2.5 s: sum tween, result fade_in
        self.play(_Part(sum_move, 0.5, 1), FadeIn(result), run_time=0.5)
        # 2.5 s – 3 s
        self.wait(0.5)
        self.remove(*sum[:3])
        self.add(*sum_s[:3])
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: sum_s write
        self.play(Write(VGroup(sum_s[3]), stroke_color="#FFFFFF"), run_time=0.5)
        # 4 s – 4.2 s
        self.wait(0.2)
        # 4.2 s – 5 s: result → sum_s
        self.play(ReplacementTransform(result[0].copy().set_z_index(1), sum_s[4]), run_time=0.8)
        # 5 s – 5.5 s
        self.wait(0.5)
        # 5.5 s – 6 s: sum_s fade_out
        self.play(FadeOut(sum_s), run_time=0.5)
        # 6 s – 6.5 s: result fade_out
        self.play(FadeOut(result), run_time=0.5)
