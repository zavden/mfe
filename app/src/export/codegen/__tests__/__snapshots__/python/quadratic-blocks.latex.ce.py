# Quadratic blocks — exported by Manim Formula Editor for ManimCE 0.22.
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

        # general: ax^2+bx+c=0
        general = MathTex(r"ax^2+bx+c=0")
        general.move_to([0, 1.5, 0])
        general.set_z_index(1)

        # moved: ax^2+bx=-c
        moved = MathTex(r"ax^2+bx=-c", color="#FFFF00")
        moved.move_to([0, -1, 0])

        # 0 s – 1 s: general write
        self.play(Write(VGroup(*general[0][:6], general[0][8], general[0][9])), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 1.8 s: general write
        self.play(Write(general[0][6:8]), run_time=0.6)
        # 1.8 s – 2 s
        self.wait(0.2)
        # 2 s – 2.5 s: general unwrite
        self.play(Unwrite(general[0][8:]), run_time=0.5)
        # 2.5 s – 2.6 s
        self.wait(0.1)
        general_to_moved = [
            ReplacementTransform(general[0][:6], moved[0][:6]),
            ReplacementTransform(general[0][7], moved[0][8]),
        ]
        # 2.6 s – 3.5 s: general → moved
        self.play(*(_Part(a, 0, 0.75) for a in general_to_moved), run_time=0.9)
        general_out = FadeOut(general[0][6])
        # 3.5 s – 3.8 s: general → moved, general fade_out
        self.play(
            *(_Part(a, 0.75, 1) for a in general_to_moved),
            _Part(general_out, 0, 0.6),
            run_time=0.3,
        )
        # 3.8 s – 3.9 s: general fade_out
        self.play(_Part(general_out, 0.6, 0.8), run_time=0.1)
        moved_appear = Write(moved[0][6:8])
        # 3.9 s – 4 s: general fade_out, moved write
        self.play(_Part(general_out, 0.8, 1), _Part(moved_appear, 0, 1 / 6), run_time=0.1)
        # 4 s – 4.5 s: moved write
        self.play(_Part(moved_appear, 1 / 6, 1), run_time=0.5)
        # 4.5 s – 5 s: moved fade_out
        self.play(FadeOut(moved), run_time=0.5)
