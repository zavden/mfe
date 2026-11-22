# Emphasis — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 960×540, 30 fps:
#     manimgl Pinned.py Pinned -w -r 960x540 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 360 frames, like the editor's video export.
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
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly.move_to([0, 0.5, 0])
        poly.set_z_index(1)

        # under: z
        under = Tex(r"z")
        under.move_to([-3, -2, 0])

        # other: y=1
        other = Tex(r"y=1")
        other.move_to([3, -1.5, 0])
        other.set_z_index(2)

        self.add(under)
        # 0 s – 1 s: poly write
        self.play(Write(poly, stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        poly_indicate = Indicate(poly[:2])
        # 1.5 s – 2 s: poly indicate
        self.play(_Part(poly_indicate, 0, 0.5), run_time=0.5)
        under_circumscribe = _Circumscribe(under)
        # 2 s – 2.5 s: poly indicate, under circumscribe
        self.play(_Part(poly_indicate, 0.5, 1), _Part(under_circumscribe, 0, 0.25), run_time=0.5)
        poly_indicate_2 = Indicate(poly[5:], scale_factor=1.5, color="#FC6255", rate_func=there_and_back_with_pause)
        # 2.5 s – 3 s: under circumscribe, poly indicate
        self.play(
            _Part(under_circumscribe, 0.25, 0.5),
            _Part(poly_indicate_2, 0, 0.5),
            run_time=0.5,
        )
        # 3 s – 3.5 s: under circumscribe, poly indicate, other fade_in
        self.play(
            _Part(under_circumscribe, 0.5, 0.75),
            _Part(poly_indicate_2, 0.5, 1),
            FadeIn(other),
            run_time=0.5,
        )
        # 3.5 s – 4 s: under circumscribe
        self.play(_Part(under_circumscribe, 0.75, 1), run_time=0.5)
        # 4 s – 5 s: poly tween, poly circumscribe
        self.play(
            poly.animate.scale(1.2).move_to([-1, 0.5, 0]),
            _Circumscribe(poly, z_index=1),
            run_time=1,
        )
        # 5 s – 5.5 s
        self.wait(0.5)
        poly_wiggle = _Wiggle(poly[3:5])
        # 5.5 s – 6 s: poly wiggle
        self.play(_Part(poly_wiggle, 0, 1 / 3), run_time=0.5)
        other_flash = Flash(other.get_center(), color="#83C167")
        other_flash.lines.set_z_index(2)
        # 6 s – 7 s: poly wiggle, other flash
        self.play(_Part(poly_wiggle, 1 / 3, 1), other_flash, run_time=1)
        poly_flash = Flash(poly[6].get_center())
        poly_flash.lines.set_z_index(1)
        # 7 s – 7.5 s: poly flash
        self.play(_Part(poly_flash, 0, 0.5), run_time=0.5)
        poly_circumscribe = _Circumscribe(poly[2:5], buff=0.25, color="#58C4DD", stroke_width=2, time_width=1, z_index=1, rate_func=linear)
        # 7.5 s – 8 s: poly flash, poly circumscribe
        self.play(_Part(poly_flash, 0.5, 1), _Part(poly_circumscribe, 0, 0.5), run_time=0.5)
        # 8 s – 8.5 s: poly circumscribe
        self.play(_Part(poly_circumscribe, 0.5, 1), run_time=0.5)
        poly_focus = FocusOn(poly[3].get_center())
        poly_focus.mobject.set_z_index(3)
        # 8.5 s – 9 s: poly focus on
        self.play(_Part(poly_focus, 0, 0.25), run_time=0.5)
        poly_wiggle_2 = _Wiggle(poly[0], scale_value=1.3, rotation_angle=10 * DEGREES, n_wiggles=3, rate_func=linear)
        # 9 s – 9.5 s: poly focus on, poly wiggle
        self.play(_Part(poly_focus, 0.25, 0.5), _Part(poly_wiggle_2, 0, 0.5), run_time=0.5)
        # 9.5 s – 10 s: poly focus on, poly wiggle, other indicate
        self.play(
            _Part(poly_focus, 0.5, 0.75),
            _Part(poly_wiggle_2, 0.5, 1),
            Indicate(other),
            run_time=0.5,
        )
        # 10 s – 10.5 s: poly focus on
        self.play(_Part(poly_focus, 0.75, 1), run_time=0.5)
        # 10.5 s – 12 s
        self.wait(1.5)
