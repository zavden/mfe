# Animation blocks — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
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


class _Uncreate(Uncreate):
    """Uncreate that gives the glyphs back their shape once they are off screen, so that
    they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # eq: x^2+5x+6=0
        eq = MathTex(r"x^2+5x+6=0")
        eq.move_to([0, 1.2, 0])
        eq.set_z_index(1)

        # factored: (x+2)(x+3)=0
        factored = MathTex(r"(x+2)(x+3)=0", color="#58C4DD")
        VGroup(factored[0][3], factored[0][8]).set_color("#FFFF00")
        factored.move_to([0, -0.8, 0])

        # 0 s – 1 s: eq write
        self.play(Write(eq[0][:7]), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 1.8 s: eq write
        self.play(Write(eq[0][7:]), run_time=0.6)
        # 1.8 s – 2.2 s
        self.wait(0.4)
        eq_pivot = eq[0][6].get_center()
        eq_pivot_2 = eq[0][3:5].get_center()
        # 2.2 s – 2.8 s: eq part, eq part
        self.play(
            eq[0][6].animate.scale(1.15, about_point=eq_pivot).set_color("#FFFF00"),
            eq[0][3:5].animate.scale(1.15, about_point=eq_pivot_2).set_color("#FFFF00"),
            run_time=0.6,
        )
        # 2.8 s – 3 s
        self.wait(0.2)
        # 3 s – 4 s: factored write
        self.play(Write(factored), run_time=1)
        # 4 s – 4.2 s
        self.wait(0.2)
        factored_part = factored[0][:5].animate.shift(0.3 * LEFT).build()
        factored_part_2 = factored[0][5:10].animate.shift(0.3 * RIGHT).build()
        # 4.2 s – 4.6 s: factored part, factored part
        self.play(_Part(factored_part, 0, 0.8), _Part(factored_part_2, 0, 0.8), run_time=0.4)
        eq_disappear = _Uncreate(eq[0][2:5])
        # 4.6 s – 4.7 s: factored part, factored part, eq uncreate
        self.play(
            _Part(factored_part, 0.8, 1),
            _Part(factored_part_2, 0.8, 1),
            _Part(eq_disappear, 0, 0.2),
            run_time=0.1,
        )
        # 4.7 s – 5.1 s: eq uncreate
        self.play(_Part(eq_disappear, 0.2, 1), run_time=0.4)
        # 5.1 s – 5.4 s
        self.wait(0.3)
        # 5.4 s – 5.9 s: eq create
        self.play(Create(eq[0][2:5]), run_time=0.5)
        # 5.9 s – 6.2 s
        self.wait(0.3)
        # 6.2 s – 6.8 s: factored tween, eq tween
        self.play(factored.animate.shift(0.6 * UP), eq.animate.shift(0.8 * UP), run_time=0.6)
        # 6.8 s – 7.4 s
        self.wait(0.6)
        # 7.4 s – 8 s: eq fade_out, factored fade_out
        self.play(FadeOut(eq), FadeOut(factored), run_time=0.6)
