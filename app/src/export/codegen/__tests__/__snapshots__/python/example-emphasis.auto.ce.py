# Emphasis — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 900 frames, like the editor's video export.
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


class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)


class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer `z_index` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # square: (a+b)^2=a^2+2ab+b^2
        square = MathTex(r"(a+b)^2=a^2+2ab+b^2", font_size=60)

        # title: The square of a sum
        title = Tex(r"The square of a sum", font_size=40, color="#58C4DD")
        title.move_to([0, 2, 0])
        title.set_z_index(1)

        square_in = Write(square)
        # 0 s – 1 s: square write
        self.play(_Part(square_in, 0, 2 / 3), run_time=1)
        title_in = FadeIn(title, shift=0.3 * DOWN)
        # 1 s – 1.5 s: square write, title fade_in
        self.play(_Part(square_in, 2 / 3, 1), _Part(title_in, 0, 0.625), run_time=0.5)
        # 1.5 s – 1.8 s: title fade_in
        self.play(_Part(title_in, 0.625, 1), run_time=0.3)
        # 1.8 s – 2 s
        self.wait(0.2)
        # 2 s – 3 s: square indicate
        self.play(Indicate(square[0][:6]), run_time=1)
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4.5 s: square circumscribe
        self.play(_Circumscribe(square[0][10:13]), run_time=1)
        # 4.5 s – 5 s
        self.wait(0.5)
        # 5 s – 6 s: square flash
        self.play(Flash(square[0][6].get_center()), run_time=1)
        # 6 s – 8 s: square wiggle
        self.play(_Wiggle(square[0][14:]), run_time=2)
        square_focus = FocusOn(square[0][7:9].get_center())
        square_focus.mobject.set_z_index(2)
        # 8 s – 10 s: square focus on
        self.play(square_focus, run_time=2)
        # 10 s – 10.2 s
        self.wait(0.2)
        # 10.2 s – 11.7 s: square indicate
        self.play(
            Indicate(square, scale_factor=1.1, color="#83C167", rate_func=there_and_back_with_pause),
            run_time=1.5,
        )
        # 11.7 s – 12 s
        self.wait(0.3)
        square_circumscribe = _Circumscribe(square, buff=0.2, color="#FC6255", stroke_width=6, time_width=0.6)
        # 12 s – 13 s: square circumscribe
        self.play(_Part(square_circumscribe, 0, 2 / 3), run_time=1)
        title_wiggle = _Wiggle(title)
        # 13 s – 13.5 s: square circumscribe, title wiggle
        self.play(_Part(square_circumscribe, 2 / 3, 1), _Part(title_wiggle, 0, 0.5), run_time=0.5)
        # 13.5 s – 14 s: title wiggle
        self.play(_Part(title_wiggle, 0.5, 1), run_time=0.5)
        # 14 s – 14.2 s
        self.wait(0.2)
        # 14.2 s – 15 s: square fade_out, title fade_out
        self.play(FadeOut(square), FadeOut(title), run_time=0.8)
