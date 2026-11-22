# Brace labels — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 270 frames, like the editor's video export.
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

        # sum: 1+2+3+4+5+6
        sum = MathTex(r"1+2+3+4+5+6")
        sum.move_to([0, 0.4, 0])
        sum.set_z_index(12)

        # free: brace
        free = Brace(Line(ORIGIN, 1.5 * RIGHT), DOWN, buff=0, color="#58C4DD")
        free.move_to([-3.4, -1.8, 0]).rotate(-90 * DEGREES)
        free.set_z_index(1)

        # first: brace, built on sum where its clip starts

        # six: 6
        six = MathTex(r"6", color="#58C4DD")
        six.set_z_index(10)

        # second: brace, built on sum where its clip starts

        # fifteen: 15
        fifteen = MathTex(r"15", color="#83C167")
        fifteen.set_z_index(8)

        # whole: brace, built on sum where its clip starts

        # tilted: brace, built on sum where its clip starts

        # first_term: a
        first_term = MathTex(r"a", color="#FC6255")
        first_term.scale(0.8).rotate(15 * DEGREES)
        first_term.set_z_index(4)

        # steep: brace, built on sum where its clip starts

        # total: 6+15=21
        total = MathTex(r"6+15=21")
        total.set_z_index(6)

        # last: last term
        last = Tex(r"last term", font_size=32)
        last.set_z_index(2)

        # w: w
        w = MathTex(r"w")

        sum_in = Write(sum)
        # 0 s – 0.5 s: sum write, free grow_from_center
        self.play(_Part(sum_in, 0, 0.5), GrowFromCenter(free), run_time=0.5)
        # 0.5 s – 1 s: sum write
        self.play(_Part(sum_in, 0.5, 1), run_time=0.5)
        # 1 s – 1.5 s
        self.wait(0.5)
        first = Brace(sum[0][:5], DOWN, buff=0.2, color="#58C4DD")
        first.set_z_index(11)
        first.put_at_tip(six, buff=0.25)
        # 1.5 s – 2 s: first grow_from_center, six fade_in
        self.play(GrowFromCenter(first), FadeIn(six), run_time=0.5)
        second = Brace(sum[0][6:], DOWN, buff=0.2, color="#83C167")
        second.set_z_index(9)
        second.put_at_tip(fifteen, buff=0.15)
        # 2 s – 2.5 s: second grow_from_center, fifteen fade_in
        self.play(GrowFromCenter(second), FadeIn(fifteen), run_time=0.5)
        whole = Brace(sum, UP, buff=0.25)
        whole.set_z_index(7)
        # 2.5 s – 3 s: whole grow_from_center
        self.play(GrowFromCenter(whole), run_time=0.5)
        tilted = Brace(sum[0][0], rotate_vector(DOWN, 30 * DEGREES), buff=0.15, color="#FC6255")
        tilted.set_z_index(5)
        tilted.put_at_tip(first_term, buff=0.25)
        # 3 s – 3.5 s: tilted grow_from_center, first_term fade_in
        self.play(GrowFromCenter(tilted), FadeIn(first_term), run_time=0.5)
        steep = Brace(sum[0][10], rotate_vector(DOWN, 62 * DEGREES), buff=0.15, color="#FFFF00")
        steep.set_z_index(3)
        # 3.5 s – 4 s: steep grow_from_center
        self.play(GrowFromCenter(steep), run_time=0.5)
        whole.put_at_tip(total, buff=0.35)
        six_to_total = ReplacementTransform(six[0][0].copy(), total[0][0])
        fifteen_to_total = ReplacementTransform(fifteen[0][:].copy(), total[0][2:4])
        # 4 s – 4.5 s: six → total, fifteen → total, total fade_in
        self.play(
            _Part(six_to_total, 0, 0.5),
            _Part(fifteen_to_total, 0, 0.5),
            FadeIn(VGroup(total[0][1], *total[0][4:])),
            run_time=0.5,
        )
        steep.put_at_tip(last, buff=0.25)
        # 4.5 s – 5 s: six → total, fifteen → total, last fade_in
        self.play(
            _Part(six_to_total, 0.5, 1),
            _Part(fifteen_to_total, 0.5, 1),
            FadeIn(last),
            run_time=0.5,
        )
        # 5 s – 5.6 s: free tween
        self.play(free.animate.shift(np.array([0.8, 0.2, 0])), run_time=0.6)
        # 5.6 s – 6 s
        self.wait(0.4)
        free.put_at_tip(w, buff=0.25)
        # 6 s – 6.5 s: w fade_in
        self.play(FadeIn(w), run_time=0.5)
        # 6.5 s – 9 s
        self.wait(2.5)
