# Splits and merges — exported by Manim Formula Editor for ManimCE 0.22.
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

        # twice: x+x+y
        twice = MathTex(r"x+x+y")
        twice.move_to([0, 2, 0])
        twice.set_z_index(2)

        # double: 2x+y
        double = MathTex(r"2x+y")
        double.set_z_index(1)

        # pair: y\,y
        pair = MathTex(r"y\,y")
        pair.move_to([3, -2, 0])

        # ones: 1+1
        ones = MathTex(r"1+1")
        ones.move_to([-3, -2, 0])
        ones.set_z_index(2)

        # 0 s – 1 s: twice write
        self.play(Write(twice), run_time=1)
        # 1 s – 2 s: twice → double
        self.play(
            ReplacementTransform(twice[0][0], double[0][1]),
            Transform(twice[0][2], double[0][1], remover=True),
            ReplacementTransform(twice[0][1], double[0][0]),
            ReplacementTransform(twice[0][3], double[0][2]),
            ReplacementTransform(twice[0][4], double[0][3]),
            run_time=1,
        )
        # 2 s – 2.5 s
        self.wait(0.5)
        double_to_pair = ReplacementTransform(VGroup(double[0][3]).copy(), pair[0][:], path_arc=45 * DEGREES)
        # 2.5 s – 3.2 s: double → pair
        self.play(_Part(double_to_pair, 0, 0.7), run_time=0.7)
        self.add(ones[0][1])
        VGroup(double[0][0]).set_z_index(2)
        double_to_ones = ReplacementTransform(VGroup(double[0][0]), VGroup(ones[0][0], ones[0][2]), rate_func=rush_from)
        # 3.2 s – 3.5 s: double → pair, double → ones
        self.play(_Part(double_to_pair, 0.7, 1), _Part(double_to_ones, 0, 0.375), run_time=0.3)
        # 3.5 s – 4 s: double → ones
        self.play(_Part(double_to_ones, 0.375, 1), run_time=0.5)
        # 4 s – 4.5 s
        self.wait(0.5)
        # 4.5 s – 5 s: double fade_out, pair fade_out, ones fade_out
        self.play(FadeOut(double[0][1:]), FadeOut(pair), FadeOut(ones), run_time=0.5)
