# Split tex ends — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
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


class _ShrinkToCenter(ShrinkToCenter):
    """ShrinkToCenter that gives the glyphs back their size once they are off screen, so
    that they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # parts: {{a}}+{{b}}^2
        parts = Tex(r"{{a}}+{{b}}^2")
        parts.move_to([-2, 1, 0])
        parts.set_z_index(2)

        # swap: b+a
        swap = Tex(r"b+a")
        swap.set_color("#83C167")
        swap.move_to([2, -1, 0])
        swap.set_z_index(1)

        # arrow: arrow, built on parts where its clip starts

        # 0 s – 0.8 s: parts write
        self.play(Write(parts, stroke_color="#FFFFFF"), run_time=0.8)
        # 0.8 s – 0.9 s
        self.wait(0.1)
        parts_disappear = _ShrinkToCenter(VGroup(parts[1]), remover=True)
        # 0.9 s – 1 s: parts shrink_to_center
        self.play(_Part(parts_disappear, 0, 0.25), run_time=0.1)
        arrow = Line(parts[3].get_corner(UR), [3, 3, 0], buff=0.1, stroke_width=6, color="#58C4DD").add_tip(length=0.35, width=0.35)
        arrow_in = ShowCreation(arrow)
        # 1 s – 1.3 s: parts shrink_to_center, arrow create
        self.play(_Part(parts_disappear, 0.25, 1), _Part(arrow_in, 0, 0.6), run_time=0.3)
        # 1.3 s – 1.5 s: arrow create
        self.play(_Part(arrow_in, 0.6, 1), run_time=0.2)
        # 1.5 s – 1.6 s
        self.wait(0.1)
        # 1.6 s – 2 s: parts grow_from_center
        self.play(GrowFromCenter(VGroup(parts[1])), run_time=0.4)
        # 2 s – 2.2 s
        self.wait(0.2)
        # 2.2 s – 3 s: parts → swap
        self.play(
            FadeTransform(parts[2].copy(), swap[0]),
            FadeTransform(parts[0].copy(), swap[2]),
            run_time=0.8,
        )
        # 3 s – 3.4 s: parts tween
        self.play(parts.animate.move_to([-2.5, 0.5, 0]).set_color("#FFFF00"), run_time=0.4)
        # 3.4 s – 3.5 s
        self.wait(0.1)
        # 3.5 s – 4 s: parts fade_out, swap fade_out
        self.play(FadeOut(parts), FadeOut(VGroup(swap[0], swap[2])), run_time=0.5)
