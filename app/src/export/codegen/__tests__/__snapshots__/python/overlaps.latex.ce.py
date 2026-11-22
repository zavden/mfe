# Overlaps — exported by Manim Formula Editor for ManimCE 0.22.
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

        # abc: a+b+c
        abc = MathTex(r"a+b+c")
        abc.move_to([0, 1, 0])
        abc.set_z_index(2)

        # mix: b-a+c
        mix = MathTex(r"b-a+c")
        mix.move_to([0, -1, 0])
        mix.set_z_index(1)

        # z: z
        z = MathTex(r"z")
        z.move_to([-4, 0, 0])

        # c: c
        c = MathTex(r"c", color="#83C167")
        c.move_to([4, 2, 0])

        # 0 s – 1.5 s: abc write
        self.play(Write(abc), run_time=1.5)
        # 1.5 s – 1.8 s
        self.wait(0.3)
        abc_to_mix = ReplacementTransform(abc[0][0], mix[0][2])
        mix_in = FadeIn(VGroup(mix[0][0], mix[0][1], mix[0][3]))
        # 1.8 s – 2 s: abc → mix, mix fade_in
        self.play(_Part(abc_to_mix, 0, 1 / 6), _Part(mix_in, 0, 1 / 3), run_time=0.2)
        self.add(z)
        # 2 s – 2.4 s: abc → mix, mix fade_in
        self.play(_Part(abc_to_mix, 1 / 6, 0.5), _Part(mix_in, 1 / 3, 1), run_time=0.4)
        # 2.4 s – 2.7 s: abc → mix
        self.play(_Part(abc_to_mix, 0.5, 0.75), run_time=0.3)
        self.remove(z)
        # 2.7 s – 3 s: abc → mix
        self.play(_Part(abc_to_mix, 0.75, 1), run_time=0.3)
        # 3 s – 3.2 s
        self.wait(0.2)
        mix[0][4].scale(1.2, about_point=[0, -1, 0]).shift(np.array([1, -1, 0]))
        # 3.2 s – 3.8 s: mix tween, abc tween
        self.play(
            mix[0][:4].animate.scale(1.2, about_point=[0, -1, 0]).shift(np.array([1, -1, 0])),
            abc[0][1:].animate.shift(1.5 * UP),
            run_time=0.6,
        )
        # 3.8 s – 3.9 s
        self.wait(0.1)
        self.add(c)
        # 3.9 s – 4 s
        self.wait(0.1)
        abc_out = FadeOut(abc[0][1:])
        c[0][0].set_z_index(1)
        # 4 s – 4.6 s: abc fade_out, c → mix
        self.play(_Part(abc_out, 0, 0.6), ReplacementTransform(c[0][0], mix[0][4]), run_time=0.6)
        # 4.6 s – 5 s: abc fade_out, mix fade_out
        self.play(_Part(abc_out, 0.6, 1), FadeOut(mix), run_time=0.4)
