# Morph copies — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
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

        # letters: a+b+c
        letters = MathTex(r"a+b+c")
        letters.scale(1.5)

        # zero: 0
        zero = MathTex(r"0", color="#FC6255")
        zero.scale(4).move_to([-0.75, 0, 0])
        zero.set_z_index(1)

        self.add(zero)
        # 0 s – 0.5 s: letters fade_in
        self.play(FadeIn(VGroup(letters[0][0], letters[0][1], letters[0][3])), run_time=0.5)
        # 0.5 s – 1 s
        self.wait(0.5)
        letters_morph = ReplacementTransform(letters[0][0].copy(), letters[0][2])
        letters_morph_2 = ReplacementTransform(letters[0][0].copy(), letters[0][4])
        # 1 s – 1.5 s: letters morph, letters morph
        self.play(_Part(letters_morph, 0, 0.25), _Part(letters_morph_2, 0, 0.25), run_time=0.5)
        # 1.5 s – 2.5 s: letters morph, letters morph, zero tween
        self.play(
            _Part(letters_morph, 0.25, 0.75),
            _Part(letters_morph_2, 0.25, 0.75),
            zero.animate.move_to([-0.75, 0.3, 0]),
            run_time=1,
        )
        # 2.5 s – 3 s: letters morph, letters morph
        self.play(_Part(letters_morph, 0.75, 1), _Part(letters_morph_2, 0.75, 1), run_time=0.5)
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: letters fade_out
        self.play(FadeOut(letters), run_time=0.5)
