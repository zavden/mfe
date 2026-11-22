# Fraction bars — exported by Manim Formula Editor for ManimCE 0.22.
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


class _Unwrite(Write):
    """Unwrite (with its rate function) that gives the glyphs back their shape once they
    are off screen, so that they can come back later."""

    def __init__(self, vmobject, **kwargs):
        super().__init__(vmobject, reverse=True, reverse_rate_function=True, remover=True, **kwargs)

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        # Write(reverse=True) puts the group back in order when it finishes, but its starting
        # copy is still reversed: reverse the group around the restoring interpolate.
        self.reverse_submobjects()
        self.interpolate(0)
        self.reverse_submobjects()


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # ratio: \frac{a}{b}+c
        ratio = MathTex(r"\frac{a}{b}+c")
        ratio.move_to([-2, 1, 0])
        ratio.set_z_index(2)

        # flipped: c=\frac{b}{a}+d
        flipped = MathTex(r"c=\frac{b}{a}+d", color="#58C4DD")
        flipped.move_to([0, -0.5, 0])
        flipped.set_z_index(1)

        # xy: \frac{x}{y}=z
        xy = MathTex(r"\frac{x}{y}=z")
        xy.move_to([2.5, 1, 0])

        # 0 s – 1 s: ratio write
        self.play(Write(ratio), run_time=1)
        flipped_in = FadeIn(flipped[0][5:])
        # 1 s – 1.2 s: flipped fade_in
        self.play(_Part(flipped_in, 0, 0.4), run_time=0.2)
        ratio_to_flipped = [
            ReplacementTransform(ratio[0][0].copy(), flipped[0][4]),
            ReplacementTransform(ratio[0][1].copy(), flipped[0][3]),
            ReplacementTransform(ratio[0][2].copy(), flipped[0][2]),
            ReplacementTransform(ratio[0][3].copy(), flipped[0][1]),
            ReplacementTransform(ratio[0][4].copy(), flipped[0][0]),
        ]
        # 1.2 s – 1.5 s: flipped fade_in, ratio → flipped
        self.play(
            _Part(flipped_in, 0.4, 1),
            *(_Part(a, 0, 0.3) for a in ratio_to_flipped),
            run_time=0.3,
        )
        # 1.5 s – 2.2 s: ratio → flipped
        self.play(*(_Part(a, 0.3, 1) for a in ratio_to_flipped), run_time=0.7)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        ratio_out = Unwrite(VGroup(*ratio[0]))
        # 2.4 s – 2.5 s: ratio unwrite
        self.play(_Part(ratio_out, 0, 1 / 6), run_time=0.1)
        flipped_to_xy = [
            ReplacementTransform(flipped[0][0], xy[0][1]),
            ReplacementTransform(flipped[0][4], xy[0][0]),
            ReplacementTransform(flipped[0][2], xy[0][2]),
        ]
        xy_in = Create(xy[0][3:])
        # 2.5 s – 3 s: ratio unwrite, flipped → xy, xy create
        self.play(
            _Part(ratio_out, 1 / 6, 1),
            *(_Part(a, 0, 0.5) for a in flipped_to_xy),
            _Part(xy_in, 0, 5 / 6),
            run_time=0.5,
        )
        # 3 s – 3.1 s: flipped → xy, xy create
        self.play(
            *(_Part(a, 0.5, 0.6) for a in flipped_to_xy),
            _Part(xy_in, 5 / 6, 1),
            run_time=0.1,
        )
        # 3.1 s – 3.5 s: flipped → xy
        self.play(*(_Part(a, 0.6, 1) for a in flipped_to_xy), run_time=0.4)
        # 3.5 s – 3.7 s
        self.wait(0.2)
        xy_disappear = _Unwrite(xy[0][1])
        # 3.7 s – 3.9 s: xy unwrite
        self.play(_Part(xy_disappear, 0, 0.4), run_time=0.2)
        flipped_out = Uncreate(VGroup(flipped[0][1], flipped[0][3], flipped[0][5], flipped[0][6]))
        # 3.9 s – 4.2 s: xy unwrite, flipped uncreate
        self.play(_Part(xy_disappear, 0.4, 1), _Part(flipped_out, 0, 0.5), run_time=0.3)
        # 4.2 s – 4.3 s: flipped uncreate
        self.play(_Part(flipped_out, 0.5, 2 / 3), run_time=0.1)
        xy_appear = Write(xy[0][1])
        # 4.3 s – 4.5 s: flipped uncreate, xy write
        self.play(_Part(flipped_out, 2 / 3, 1), _Part(xy_appear, 0, 0.5), run_time=0.2)
        # 4.5 s – 4.7 s: xy write
        self.play(_Part(xy_appear, 0.5, 1), run_time=0.2)
        # 4.7 s – 5 s: xy shrink_to_center
        self.play(ShrinkToCenter(xy, remover=True), run_time=0.3)
