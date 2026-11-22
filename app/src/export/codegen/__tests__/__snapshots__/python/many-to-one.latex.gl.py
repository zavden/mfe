# Many to one — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 270 frames, like the editor's video export.
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

        # squares: x^2+y^2
        squares = Tex(r"x^2+y^2")
        squares.move_to([-3, 1.5, 0])
        squares.set_z_index(2)

        # square: z^2
        square = Tex(r"z^2")
        square.move_to([3, 1.5, 0])
        square.set_z_index(1)

        # sum: a+a
        sum = Tex(r"a+a")
        sum.move_to([-3, 0, 0])
        sum.set_z_index(2)

        # one: a
        one = Tex(r"a")
        one.move_to([3, 0, 0])

        # twice: m+m
        twice = Tex(r"m+m")
        twice.move_to([-3, -1.5, 0])
        twice.set_z_index(2)

        # once: m
        once = Tex(r"m")
        once.move_to([3, -1.5, 0])
        once.set_z_index(1)

        # ones: 1+1=2
        ones = Tex(r"1+1=2")
        ones.move_to([0, -2.5, 0])

        # 0 s – 0.8 s: squares write
        self.play(Write(squares, stroke_color="#FFFFFF"), run_time=0.8)
        # 0.8 s – 1.5 s
        self.wait(0.7)
        # 1.5 s – 2.5 s: squares → square
        self.play(
            ReplacementTransform(squares[0], square[0]),
            ReplacementTransform(squares[1], square[1]),
            ReplacementTransform(squares[4], square[1]),
            run_time=1,
        )
        self.remove(squares[2], squares[3])
        # 2.5 s – 2.6 s
        self.wait(0.1)
        # 2.6 s – 3 s: sum fade_in
        self.play(FadeIn(sum), run_time=0.4)
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: square fade_out
        self.play(FadeOut(square), run_time=0.5)
        # 4 s – 4.5 s: sum → one
        self.play(
            ReplacementTransform(VGroup(sum[0], sum[2]), VGroup(one[0]), rate_func=linear),
            run_time=0.5,
        )
        self.remove(sum[1])
        # 4.5 s – 4.6 s
        self.wait(0.1)
        # 4.6 s – 5 s: twice write
        self.play(Write(twice, stroke_color="#FFFFFF"), run_time=0.4)
        # 5 s – 5.5 s
        self.wait(0.5)
        twice_to_once = [
            ReplacementTransform(twice[0], once[0], path_arc=-40 * DEGREES),
            TransformFromCopy(twice[2], once[0], path_arc=-40 * DEGREES),
        ]
        # 5.5 s – 6 s: one fade_out, twice → once
        self.play(FadeOut(one), *(_Part(a, 0, 5 / 9) for a in twice_to_once), run_time=0.5)
        # 6 s – 6.4 s: twice → once
        self.play(*(_Part(a, 5 / 9, 1) for a in twice_to_once), run_time=0.4)
        # 6.4 s – 6.5 s
        self.wait(0.1)
        ones_in = Write(ones[:4], stroke_color="#FFFFFF")
        # 6.5 s – 7 s: twice fade_out, ones write
        self.play(FadeOut(twice[1:]), _Part(ones_in, 0, 5 / 6), run_time=0.5)
        # 7 s – 7.1 s: ones write
        self.play(_Part(ones_in, 5 / 6, 1), run_time=0.1)
        # 7.1 s – 7.5 s
        self.wait(0.4)
        once_out = ShrinkToCenter(once, remover=True)
        # 7.5 s – 7.7 s: once shrink_to_center
        self.play(_Part(once_out, 0, 0.4), run_time=0.2)
        ones_morph = [
            ReplacementTransform(ones[0], ones[4]),
            TransformFromCopy(ones[2], ones[4]),
        ]
        # 7.7 s – 8 s: once shrink_to_center, ones morph
        self.play(_Part(once_out, 0.4, 1), *(_Part(a, 0, 0.3) for a in ones_morph), run_time=0.3)
        # 8 s – 8.7 s: ones morph
        self.play(*(_Part(a, 0.3, 1) for a in ones_morph), run_time=0.7)
        # 8.7 s – 9 s
        self.wait(0.3)
