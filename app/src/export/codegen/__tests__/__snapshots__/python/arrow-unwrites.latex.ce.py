# Arrow unwrites — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 90 frames, like the editor's video export.
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

        # arrow: arrow
        arrow = Arrow([-4.5, 1.89246, 0], [-1.5, 2.39246, 0], buff=0, color="#FFFF00")
        arrow.set_z_index(4)

        # both: double arrow
        both = DoubleArrow([-4.5, 0.95, 0], [-1.5, 0.45, 0], buff=0, color="#83C167")
        both.set_z_index(3)

        # bow: double arrow
        bow = DoubleArrow([-4.5, -1.32407, 0], [-1.5, -1.32407, 0], buff=0, path_arc=70 * DEGREES, color="#58C4DD", tip_shape_end=StealthTip, tip_shape_start=StealthTip)
        bow.set_z_index(2)

        # back: arrow
        back = Arrow([1.75, 1.283752, 0], [4.25, 2.283752, 0], buff=0, color="#FC6255", tip_shape=StealthTip)
        back.set_z_index(1)

        # hook: arrow
        hook = Arrow([1.75, -1.122595, 0], [4.25, -1.622595, 0], buff=0, path_arc=-90 * DEGREES, color="#FFFF00", tip_shape=StealthTip)

        self.add(bow)
        self.add(back)
        self.add(hook)
        arrow_in = Write(arrow)
        both_in = Create(both)
        # 0 s – 0.3 s: arrow write, both create
        self.play(_Part(arrow_in, 0, 0.5), _Part(both_in, 0, 0.5), run_time=0.3)
        back_disappear = _Unwrite(VGroup(back, *back.submobjects))
        # 0.3 s – 0.5 s: arrow write, both create, back unwrite
        self.play(
            _Part(arrow_in, 0.5, 5 / 6),
            _Part(both_in, 0.5, 5 / 6),
            _Part(back_disappear, 0, 2 / 9),
            run_time=0.2,
        )
        hook_disappear = _Unwrite(VGroup(hook, *hook.submobjects))
        # 0.5 s – 0.6 s: arrow write, both create, back unwrite, hook unwrite
        self.play(
            _Part(arrow_in, 5 / 6, 1),
            _Part(both_in, 5 / 6, 1),
            _Part(back_disappear, 2 / 9, 1 / 3),
            _Part(hook_disappear, 0, 0.1),
            run_time=0.1,
        )
        # 0.6 s – 1.2 s: back unwrite, hook unwrite
        self.play(_Part(back_disappear, 1 / 3, 1), _Part(hook_disappear, 0.1, 0.7), run_time=0.6)
        # 1.2 s – 1.3 s: hook unwrite
        self.play(_Part(hook_disappear, 0.7, 0.8), run_time=0.1)
        arrow_out = Unwrite(VGroup(arrow, *arrow.submobjects))
        both_out = Unwrite(VGroup(both, *both.submobjects))
        bow_out = Write(VGroup(bow, *bow.submobjects), reverse=True, reverse_rate_function=True, rate_func=smooth, remover=True)
        # 1.3 s – 1.5 s: hook unwrite, arrow unwrite, both unwrite, bow unwrite
        self.play(
            _Part(hook_disappear, 0.8, 1),
            _Part(arrow_out, 0, 1 / 6),
            _Part(both_out, 0, 1 / 6),
            _Part(bow_out, 0, 1 / 6),
            run_time=0.2,
        )
        # 1.5 s – 1.6 s: arrow unwrite, both unwrite, bow unwrite
        self.play(
            _Part(arrow_out, 1 / 6, 0.25),
            _Part(both_out, 1 / 6, 0.25),
            _Part(bow_out, 1 / 6, 0.25),
            run_time=0.1,
        )
        back_appear = FadeIn(back)
        # 1.6 s – 2 s: arrow unwrite, both unwrite, bow unwrite, back fade_in
        self.play(
            _Part(arrow_out, 0.25, 7 / 12),
            _Part(both_out, 0.25, 7 / 12),
            _Part(bow_out, 0.25, 7 / 12),
            _Part(back_appear, 0, 0.8),
            run_time=0.4,
        )
        hook_appear = Write(hook)
        # 2 s – 2.1 s: arrow unwrite, both unwrite, bow unwrite, back fade_in, hook write
        self.play(
            _Part(arrow_out, 7 / 12, 2 / 3),
            _Part(both_out, 7 / 12, 2 / 3),
            _Part(bow_out, 7 / 12, 2 / 3),
            _Part(back_appear, 0.8, 1),
            _Part(hook_appear, 0, 1 / 6),
            run_time=0.1,
        )
        # 2.1 s – 2.5 s: arrow unwrite, both unwrite, bow unwrite, hook write
        self.play(
            _Part(arrow_out, 2 / 3, 1),
            _Part(both_out, 2 / 3, 1),
            _Part(bow_out, 2 / 3, 1),
            _Part(hook_appear, 1 / 6, 5 / 6),
            run_time=0.4,
        )
        # 2.5 s – 2.6 s: hook write
        self.play(_Part(hook_appear, 5 / 6, 1), run_time=0.1)
        # 2.6 s – 3 s
        self.wait(0.4)
